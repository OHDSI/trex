// The Discord channel adapter — the REFERENCE adapter for the channels layer.
// It is a thin trex factory over eve's vendored PURE Discord helpers
// (vendor/discord/*): signature verify, interaction parse, REST/message-split,
// and HITL component encode/decode are all vendored; only the wiring into
// `defineChannel` (this file) is trex code.
//
// SIGNATURE-BEFORE-SEND (trust boundary): the channel layer serves this route
// WITHOUT the trex JWT — the proxy exempts {basePath}/eve/v1/discord/* so an
// unauthenticated Discord webhook can reach it (layer.ts's TRUST BOUNDARY note).
// The ONLY thing authenticating the caller is the Ed25519 signature check, so
// the route runs `verifyDiscordInbound` FIRST and returns 401 on failure BEFORE
// ever calling `send()` (the only path from a route to an agent session). Every
// branch that could start a session is downstream of that gate.
//
// DEFERRED-ACK: a Discord command must be acknowledged within ~3s. The route
// starts the turn via `send()` (fire-and-forget) and immediately returns a
// deferred ACK; the agent's real reply is delivered later by the
// `message.completed` events handler, which edits the deferred original
// response (then follows up for any 2000-char overflow chunks).
//
// HITL: `input.requested` → Discord components (buttons/select/modal via the
// vendored HITL helpers); the component/modal callback → derive InputResponses
// (vendored) → resume the parked session. The callback's custom_id carries the
// requestId, so the channel layer's resume primitive (`args.resume`, Task 17/18)
// resolves BY REQUEST ID (Mode A) with a channel-ownership check — the send-time
// continuation token (channelId:interactionId) never matches the callback's
// channelId:messageId, but the requestId does, so Discord HITL works without any
// token match. `opts.resume` remains an injectable override; without it the
// default routes the decoded decision through `args.resume` (a miss is logged,
// never thrown). See task-8-report.md / task-18-report.md.

import { defineChannel, POST } from "eve/channels";
import type { ChannelAllowList, ChannelAuth, ChannelDef, ChannelEventHandlers, ChannelRouteArgs } from "eve/channels";
import { channelAllows, envAllowList } from "../allow.ts";

import {
  type DiscordCredentials,
  type DiscordFetch,
  discordContinuationToken,
  createDiscordFollowupMessage,
  editDiscordOriginalResponse,
  type DiscordMessageBody,
  sendDiscordChannelMessage,
  splitDiscordMessageContent,
  triggerDiscordTypingIndicator,
} from "../vendor/discord/api.ts";
import {
  commandInteractionMessage,
  type DiscordCommandInteraction,
  DISCORD_INTERACTION_RESPONSE_TYPE,
  DISCORD_INTERACTION_TYPE,
  formatDiscordContextBlock,
  parseDiscordInteraction,
} from "../vendor/discord/inbound.ts";
import {
  buildFreeformModalResponse,
  deriveComponentInputResponses,
  deriveModalInputResponses,
  isDiscordFreeformComponent,
  renderInputRequestComponents,
} from "../vendor/discord/hitl.ts";
import { createDiscordThread, interactionChannelInfo, isThreadChannel, threadNameForTask } from "./discord-threads.ts";
import { defaultDiscordAuth } from "../vendor/discord/defaults.ts";
import { discordDeferredJson, discordJson, discordJsonBody, readMessageContent } from "../vendor/discord/responses.ts";
import { verifyDiscordInbound } from "../vendor/discord/verifyInbound.ts";
import { getEnv, type InputResponse } from "../vendor/discord/shared.ts";
import type { DiscordWebhookVerifier } from "../vendor/discord/verify.ts";

// Per-session Discord routing threaded as the channel session `state` — set on
// send() at command time and read by the delivery (`events`) handlers.
interface DiscordDeliveryState {
  channelId?: string;
  applicationId?: string;
  interactionToken?: string;
  guildId?: string | null;
  // Flipped true after the first delivery consumes the deferred original
  // response, so subsequent chunks/messages in the same turn follow up.
  initialResponseSent?: boolean;
  ephemeral?: boolean;
}

/** Result of a command hook: how to attribute + shape the turn (or null to ignore). */
export interface DiscordCommandResult {
  auth?: ChannelAuth | null;
  /** Extra context blocks prepended to the model-facing message. */
  context?: string[];
  ephemeral?: boolean;
}

/** Context handed to a resume transport for a HITL callback. */
export interface DiscordResumeContext {
  req: Request;
  args: ChannelRouteArgs;
  channelId: string;
  messageId: string;
  /** Raw channel continuation token (`<channelId>:<messageId>`) addressing the parked session. */
  continuationToken: string;
  inputResponses: readonly InputResponse[];
  interaction: unknown;
}

export interface DiscordChannelOptions {
  /** Route path within the channel. Defaults to "/" (the channel root). */
  route?: string;
  /** Credentials (public key / application id / bot token). Each falls back to `DISCORD_*` env. */
  credentials?: DiscordCredentials & { webhookVerifier?: DiscordWebhookVerifier };
  /** REST overrides for tests / non-standard runtimes. */
  api?: { fetch?: DiscordFetch; apiBaseUrl?: string };
  /** Command hook: decide auth + extra context, or return null to ignore the command. */
  onCommand?: (
    interaction: DiscordCommandInteraction,
  ) => DiscordCommandResult | null | Promise<DiscordCommandResult | null>;
  /** Extra/override event handlers merged over the built-in delivery handlers. */
  events?: ChannelEventHandlers;
  /** HITL resume transport (see DEFAULT below). */
  resume?: (ctx: DiscordResumeContext) => void | Promise<void>;
  /**
   * Conversation id override for the send-time continuation token (mirrors the
   * injectable `resume` override above). Given the parsed command interaction,
   * returns the id to pair with `channelId` in `discordContinuationToken`.
   * Defaults to `interaction.id`, so every slash command starts a NEW session;
   * an integrator that wants multiple interactions in a channel to continue the
   * SAME session (e.g. a stable per-channel id) can override it here.
   */
  conversationId?: (interaction: DiscordCommandInteraction) => string;
  /**
   * Inbound access filter (user ids / channel ids). Falls back to
   * DISCORD_ALLOWED_USERS / DISCORD_ALLOWED_CHANNELS env (comma-separated);
   * absent = everyone. Applied to every interaction type before dispatch.
   * For interactions inside a thread, the thread's PARENT channel id also
   * satisfies the conversation check — allow-listing a channel covers its
   * task threads.
   */
  allow?: ChannelAllowList;
  /**
   * Thread-per-task mode: a command in a regular guild channel creates a
   * public thread, keys the session to the THREAD id (parallel threads =
   * parallel sessions), and delivers the whole conversation there; the
   * deferred original response becomes a pointer to the thread. A command
   * already inside a thread continues that thread's session. Falls back to
   * the in-channel behavior when thread creation fails (missing permission,
   * DMs). Needs the bot permissions "Create Public Threads" + "Send Messages
   * in Threads".
   */
  threads?: boolean;
}

// custom_id of a postChoice string-select (claw's Gate-1 option picker). Unlike
// HITL approvals (verb-restricted to approve/deny), a choice carries an arbitrary
// value, so the click resumes the session via a message (see handleComponent).
const CHOICE_CUSTOM_ID = "eve_choice";

export function discordChannel(opts: DiscordChannelOptions = {}): ChannelDef {
  const route = opts.route ?? "/";

  const credentials = (): DiscordCredentials => ({
    applicationId: opts.credentials?.applicationId,
    // Resolve the env fallback HERE: callDiscordApi only attaches bot auth when
    // a token is present in its input — with env-provided credentials (the
    // documented default) an undefined botToken meant typing + channel-message
    // delivery went out with NO Authorization header at all (Discord 401).
    botToken: opts.credentials?.botToken ?? getEnv("DISCORD_BOT_TOKEN"),
    publicKey: opts.credentials?.publicKey,
  });
  const apiOpts = () => ({ apiBaseUrl: opts.api?.apiBaseUrl, credentials: credentials(), fetch: opts.api?.fetch });

  // Deliver one Discord message body for a session, editing the deferred
  // original response first (then following up), else posting to the channel.
  async function deliver(state: DiscordDeliveryState, body: DiscordMessageBody) {
    const token = state.interactionToken;
    if (token) {
      try {
        if (!state.initialResponseSent) {
          state.initialResponseSent = true;
          return await editDiscordOriginalResponse({ ...apiOpts(), interactionToken: token, body });
        }
        return await createDiscordFollowupMessage({ ...apiOpts(), interactionToken: token, body });
      } catch (e) {
        console.warn("discord: interaction-token delivery failed, falling back to channel message:", e);
      }
    }
    if (state.channelId) return await sendDiscordChannelMessage({ ...apiOpts(), channelId: state.channelId, body });
    throw new Error("discordChannel: no interaction token or channel id available for delivery.");
  }

  async function tryTyping(state: DiscordDeliveryState) {
    // Typing requires the bot token; skip silently when only interaction-token
    // creds are configured. Best-effort — a failure never affects the turn.
    if (!opts.credentials?.botToken && !getEnv("DISCORD_BOT_TOKEN")) return;
    if (!state.channelId) return;
    try {
      await triggerDiscordTypingIndicator({ ...apiOpts(), channelId: state.channelId });
    } catch (e) {
      console.warn("discord: typing indicator failed — swallowed:", e);
    }
  }

  const stateOf = (channelCtx: unknown): DiscordDeliveryState =>
    ((channelCtx as { state?: DiscordDeliveryState } | undefined)?.state ?? {}) as DiscordDeliveryState;

  const builtinEvents: ChannelEventHandlers = {
    async "turn.started"(_data, channelCtx) {
      await tryTyping(stateOf(channelCtx));
    },
    async "actions.requested"(_data, channelCtx) {
      await tryTyping(stateOf(channelCtx));
    },
    async "input.requested"(data, channelCtx) {
      const state = stateOf(channelCtx);
      const requests = (data?.requests ?? []) as Array<{ requestId: string; action?: { toolName?: string; input?: unknown } }>;
      for (const item of requests) {
        const toolName = item.action?.toolName ?? "action";
        // trex's input.requested is a tool-approval (`needsApproval`) request; it
        // carries no eve-style prompt/options, so shape an approve/deny request
        // for the vendored renderer (→ approve/deny buttons).
        const request = {
          requestId: item.requestId,
          prompt: `Approve \`${toolName}\`?`,
          action: item.action,
          display: "confirmation" as const,
          options: [
            { id: "approve", label: "Approve", style: "primary" as const },
            { id: "deny", label: "Deny", style: "danger" as const },
          ],
        };
        const components = renderInputRequestComponents(request);
        const content = splitDiscordMessageContent(request.prompt)[0] ?? request.prompt;
        await deliver(state, { components, content });
      }
    },
    async "message.completed"(data, channelCtx) {
      const message = (data as { message?: string; finishReason?: string })?.message;
      const finishReason = (data as { finishReason?: string })?.finishReason;
      // Mid-turn tool-call steps carry no user-facing message; skip them.
      if (finishReason === "tool-calls" || !message) return;
      const state = stateOf(channelCtx);
      for (const content of splitDiscordMessageContent(message)) {
        await deliver(state, { content });
      }
    },
  };

  const events: ChannelEventHandlers = { ...builtinEvents, ...opts.events };

  async function handleCommand(interaction: DiscordCommandInteraction, args: ChannelRouteArgs): Promise<Response> {
    let result: DiscordCommandResult | null;
    try {
      result = opts.onCommand ? await opts.onCommand(interaction) : {};
    } catch (e) {
      console.error("discord: command handler failed:", e);
      return discordJson({ content: "The Discord command handler failed.", ephemeral: true });
    }
    if (result === null) return discordJson({ content: "Command ignored.", ephemeral: true });

    // Honor an EXPLICIT `{ auth: null }` (an unauthenticated/anonymous session)
    // — only fall back to the default Discord identity when the hook omits
    // `auth` entirely. `result.auth ?? …` would wrongly collapse null → default.
    const auth: ChannelAuth | null = "auth" in result ? result.auth ?? null : toChannelAuth(interaction);
    const message = commandInteractionMessage(interaction);
    const contextBlock = formatDiscordContextBlock({
      channelId: interaction.channelId,
      commandName: interaction.commandName,
      guildId: interaction.guildId,
      interactionId: interaction.id,
      userId: interaction.user.id,
      username: interaction.user.username,
    });
    const fullMessage = [contextBlock, ...(result.context ?? []), message].join("\n\n");

    // Thread-per-task (opts.threads): a command in a regular guild channel
    // gets its own public thread; the session is keyed to the THREAD id so
    // every task is an independent session and tasks run in parallel. A
    // command already inside a thread skips creation (its channelId IS the
    // thread id, so the normal path below continues that thread's session).
    // Creation failure falls back to the in-channel session — never drops
    // the command.
    if (opts.threads === true && interaction.guildId && !isThreadChannel(interactionChannelInfo(interaction.raw))) {
      let threadId: string | null = null;
      const threadName = threadNameForTask(message);
      try {
        threadId = (await createDiscordThread({ ...apiOpts(), channelId: interaction.channelId, name: threadName })).id;
      } catch (e) {
        console.warn("discord: task-thread creation failed — falling back to in-channel session:", e);
      }
      if (threadId !== null) {
        // Delivery goes to the thread via bot-token channel messages — the
        // interaction token would land replies in the PARENT channel, so it
        // stays out of the state (initialResponseSent: true keeps deliver()
        // off the deferred original). Ephemeral is meaningless in a public
        // thread and is ignored.
        const state: DiscordDeliveryState = {
          channelId: threadId,
          applicationId: interaction.applicationId,
          guildId: interaction.guildId ?? null,
          initialResponseSent: true,
          ephemeral: false,
        };
        await args.send(fullMessage, {
          auth,
          continuationToken: discordContinuationToken(threadId, threadId),
          state,
          title: threadName,
        });
        // Turn the deferred original response into a pointer so the channel
        // sees where the task went. Retried: in webhook mode the deferred
        // response only materializes once this handler's return value reaches
        // Discord (in gateway mode the pre-ACK already exists).
        args.waitUntil(pointToThread(interaction.token, threadId));
        return discordDeferredJson(false);
      }
    }

    const state: DiscordDeliveryState = {
      channelId: interaction.channelId,
      applicationId: interaction.applicationId,
      interactionToken: interaction.token,
      guildId: interaction.guildId ?? null,
      initialResponseSent: false,
      ephemeral: result.ephemeral === true,
    };
    // send() FIRST resolves-or-creates the session + starts the turn; the reply
    // is delivered later by the events handlers. Return the deferred ACK so
    // Discord shows a "thinking…" state within its deadline.
    await args.send(fullMessage, {
      auth,
      continuationToken: discordContinuationToken(
        interaction.channelId,
        opts.conversationId ? opts.conversationId(interaction) : interaction.id,
      ),
      state,
    });
    return discordDeferredJson(result.ephemeral === true);
  }

  // Edits the deferred original response into a link to the task thread.
  // Retried because in webhook mode the deferred response is created from this
  // handler's OWN return value, which Discord may not have processed yet when
  // the background task runs.
  async function pointToThread(interactionToken: string, threadId: string): Promise<void> {
    const body = { content: `Started <#${threadId}> for this task.` };
    for (const delayMs of [0, 500, 1500, 3000]) {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      try {
        await editDiscordOriginalResponse({ ...apiOpts(), interactionToken, body });
        return;
      } catch { /* deferred response not materialized yet — retry */ }
    }
    console.warn("discord: could not edit the original response into a thread pointer (gave up after retries)");
  }

  async function handleComponent(
    interaction: import("../vendor/discord/inbound.ts").DiscordComponentInteraction,
    args: ChannelRouteArgs,
    req: Request,
  ): Promise<Response> {
    // Option pick (postChoice): resume the session with the chosen value as a
    // message. HITL approvals are verb-restricted (approve/deny), so a free-form
    // A/B/C choice can't ride them — instead it drives a turn via args.send, the
    // same primitive a /trex command uses, keyed to the identical
    // channelId:conversationId token the session was opened with.
    if (interaction.customId === CHOICE_CUSTOM_ID) {
      // Join for multi-select (max_values > 1); a single pick is just one value.
      const value = interaction.values.join(", ");
      if (value) {
        await args.send(`The team selected: ${value}`, {
          auth: toChannelAuth(interaction as unknown as DiscordCommandInteraction),
          continuationToken: discordContinuationToken(
            interaction.channelId,
            opts.conversationId
              ? opts.conversationId(interaction as unknown as DiscordCommandInteraction)
              : interaction.channelId,
          ),
          state: {
            channelId: interaction.channelId,
            applicationId: interaction.applicationId,
            guildId: interaction.guildId ?? null,
            initialResponseSent: true,
            ephemeral: false,
          },
        });
      }
      return discordJsonBody({ type: DISCORD_INTERACTION_RESPONSE_TYPE.DEFERRED_UPDATE_MESSAGE });
    }
    // Freeform HITL: open a modal so the user can type an answer.
    if (isDiscordFreeformComponent(interaction.customId)) {
      const prompt = readMessageContent(interaction.raw);
      return discordJsonBody(buildFreeformModalResponse({ customId: interaction.customId, prompt }));
    }
    const inputResponses = deriveComponentInputResponses(interaction);
    if (inputResponses.length > 0) {
      await runResume({
        req,
        args,
        channelId: interaction.channelId,
        messageId: interaction.messageId,
        continuationToken: discordContinuationToken(interaction.channelId, interaction.messageId),
        inputResponses,
        interaction,
      });
    }
    return discordJsonBody({ type: DISCORD_INTERACTION_RESPONSE_TYPE.DEFERRED_UPDATE_MESSAGE });
  }

  async function handleModal(
    interaction: import("../vendor/discord/inbound.ts").DiscordModalSubmitInteraction,
    args: ChannelRouteArgs,
    req: Request,
  ): Promise<Response> {
    const inputResponses = deriveModalInputResponses(interaction);
    if (inputResponses.length > 0) {
      const conversationId = interaction.messageId ?? interaction.id;
      await runResume({
        req,
        args,
        channelId: interaction.channelId,
        messageId: conversationId,
        continuationToken: discordContinuationToken(interaction.channelId, conversationId),
        inputResponses,
        interaction,
      });
    }
    return discordJson({ content: "Answer received.", ephemeral: true });
  }

  async function runResume(ctx: DiscordResumeContext) {
    try {
      if (opts.resume) {
        // An integrator override fully owns applying the decision.
        await opts.resume(ctx);
        return;
      }
      // DEFAULT: apply the decoded decision via the channel layer's resume
      // primitive. The button/modal callback custom_id carries the requestId
      // (decoded above into inputResponses), so the layer resolves BY REQUEST ID
      // (Mode A) — the interaction-id continuation token, which never matches the
      // callback's message-id, is irrelevant. A miss returns `{ok:false}` (logged,
      // never thrown); the DEFERRED_UPDATE ACK is returned by the caller regardless.
      const result = await ctx.args.resume(ctx.continuationToken, {
        inputResponses: ctx.inputResponses.map((r) => ({ requestId: r.requestId, optionId: r.optionId })),
      });
      if (!result.ok) {
        console.warn(`agents/discord: HITL resume did not apply the decision: ${result.error ?? "unknown error"}`);
      }
    } catch (e) {
      console.error("discord: HITL resume failed:", e);
    }
  }

  return defineChannel({
    events,
    routes: [
      POST(route, async (req, args) => {
        // 1) SIGNATURE FIRST — 401 before any parse or send().
        const rawBody = await verifyDiscordInbound(req, opts.credentials);
        if (rawBody === null) return new Response("unauthorized", { status: 401 });

        // 2) parse
        let payload: unknown;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return discordJson({ content: "invalid request", ephemeral: true });
        }
        if ((payload as { type?: number })?.type === DISCORD_INTERACTION_TYPE.PING) {
          return discordJson({ type: DISCORD_INTERACTION_RESPONSE_TYPE.PONG });
        }
        const interaction = parseDiscordInteraction(payload);
        if (interaction === null) {
          return discordJson({ content: "Unsupported Discord interaction.", ephemeral: true });
        }

        // 3) allow-list — gates every interaction type (commands, HITL
        // buttons, modals) before any send()/resume(). Inside a thread the
        // parent channel id also satisfies the conversation check.
        const allow = opts.allow ?? envAllowList("DISCORD");
        const parentId = interactionChannelInfo(interaction.raw).parentId;
        if (
          !channelAllows(allow, {
            userId: interaction.user.id,
            conversationId: interaction.channelId,
            ...(parentId ? { conversationParentId: parentId } : {}),
          })
        ) {
          return discordJson({ content: "You are not authorized to use this bot here.", ephemeral: true });
        }

        // 4) dispatch
        if (interaction.type === DISCORD_INTERACTION_TYPE.APPLICATION_COMMAND) {
          return handleCommand(interaction, args);
        }
        if (interaction.type === DISCORD_INTERACTION_TYPE.MESSAGE_COMPONENT) {
          return handleComponent(interaction, args, req);
        }
        return handleModal(interaction, args, req);
      }),
    ],
  });
}

// Maps the vendored Discord auth context to the layer's ChannelAuth (issuer is
// folded into attributes; principalType widens to the ChannelAuth union).
function toChannelAuth(interaction: DiscordCommandInteraction): ChannelAuth {
  const a = defaultDiscordAuth(interaction);
  return {
    authenticator: a.authenticator,
    principalType: a.principalType,
    principalId: a.principalId,
    attributes: { ...a.attributes, ...(a.issuer ? { issuer: a.issuer } : {}) },
  };
}
