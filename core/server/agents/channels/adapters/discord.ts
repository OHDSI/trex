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
  resolveDiscordApplicationId,
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
import {
  createDiscordThread,
  createDiscordThreadFromMessage,
  interactionChannelInfo,
  isThreadChannel,
  threadNameForTask,
} from "./discord-threads.ts";
import {
  decideMessageTrigger,
  type DiscordChannelSnapshot,
  fetchMessagesBefore,
  formatAttachmentsBlock,
  formatDiscordMessageContextBlock,
  formatMessagesBlock,
  getChannelSnapshot,
  type HistoryMessage,
  markdownTablesToCodeBlocks,
  parseDiscordMessageEvent,
  resolveBotManagedRoleId,
  stripBotMention,
} from "./discord-messages.ts";
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
  /**
   * MESSAGE_CREATE mode (gateway-only): adds a POST "<route>/messages" route
   * fed by the host gateway client's signed loopback. @mentions behave like
   * /trex (task thread per mention); any human message in a bot-owned task
   * thread drives that thread's session. Discord never webhooks messages, so
   * this is inert in webhook mode.
   */
  messages?: boolean;
}

// custom_id of a postChoice string-select (claw's Gate-1 option picker). Unlike
// HITL approvals (verb-restricted to approve/deny), a choice carries an arbitrary
// value, so the click resumes the session via a message (see handleComponent).
const CHOICE_CUSTOM_ID = "eve_choice";

// custom_ids of a postQuestion open-question flow: the "Answer" button opens a
// text modal, and the modal submit resumes the session via a message — the same
// resume-by-message pattern as CHOICE_CUSTOM_ID (free text cannot ride the
// verb-restricted HITL approvals either).
const QUESTION_CUSTOM_ID = "eve_question";
const QUESTION_MODAL_CUSTOM_ID = "eve_question_modal";
const QUESTION_TEXT_INPUT_ID = "eve_question_text";

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
    // A user-facing message (or approval buttons) ends the "working" state, and
    // the message itself clears Discord's typing indicator — stop the heartbeat.
    stopTyping(state.channelId);
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

  // Discord expires "typing" after ~10s, but a turn can block far longer (the
  // coder runs a full agentic turn behind askCodeAgent). Re-trigger on a
  // heartbeat so the channel keeps showing activity until the turn delivers,
  // then stop. Keyed by channel id; a new turn replaces any prior heartbeat.
  const typingHeartbeats = new Map<string, number>();
  const TYPING_INTERVAL_MS = 8_000;
  const TYPING_MAX_TICKS = 75; // ~10 min cap, then give up so a parked/idle turn can't type forever.

  function stopTyping(channelId: string | undefined) {
    if (!channelId) return;
    const handle = typingHeartbeats.get(channelId);
    if (handle !== undefined) {
      clearInterval(handle);
      typingHeartbeats.delete(channelId);
    }
  }

  async function startTyping(state: DiscordDeliveryState) {
    if (!opts.credentials?.botToken && !getEnv("DISCORD_BOT_TOKEN")) return;
    if (!state.channelId) return;
    const channelId = state.channelId;
    stopTyping(channelId);
    await tryTyping(state);
    let ticks = 0;
    const handle = setInterval(() => {
      if (++ticks >= TYPING_MAX_TICKS) {
        stopTyping(channelId);
        return;
      }
      void tryTyping(state);
    }, TYPING_INTERVAL_MS);
    typingHeartbeats.set(channelId, handle);
  }

  const stateOf = (channelCtx: unknown): DiscordDeliveryState =>
    ((channelCtx as { state?: DiscordDeliveryState } | undefined)?.state ?? {}) as DiscordDeliveryState;

  const builtinEvents: ChannelEventHandlers = {
    async "turn.started"(_data, channelCtx) {
      await startTyping(stateOf(channelCtx));
    },
    async "actions.requested"(_data, channelCtx) {
      await startTyping(stateOf(channelCtx));
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
      for (const content of splitDiscordMessageContent(markdownTablesToCodeBlocks(message))) {
        await deliver(state, { content });
      }
    },
    // Turn boundaries stop the typing heartbeat even when the turn parked without
    // an adapter delivery — e.g. claw posts a dropdown/approval directly via its
    // own tools and then waits on the human. Otherwise "typing…" would linger.
    async "turn.completed"(_data, channelCtx) {
      stopTyping(stateOf(channelCtx).channelId);
    },
    async "turn.failed"(_data, channelCtx) {
      stopTyping(stateOf(channelCtx).channelId);
    },
    async "session.failed"(_data, channelCtx) {
      stopTyping(stateOf(channelCtx).channelId);
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

    // /command inside an existing thread: when messages mode is on, a thread
    // the bot does not own carries discussion claw has never seen — inject it.
    let threadContext = "";
    if (opts.messages === true && isThreadChannel(interactionChannelInfo(interaction.raw))) {
      try {
        const snapshot = await getChannelSnapshot(apiOpts(), interaction.channelId, channelSnapshots);
        const applicationId = await resolveDiscordApplicationId(opts.credentials?.applicationId);
        if (snapshot.ownerId !== applicationId) {
          threadContext = formatMessagesBlock(
            "thread_messages",
            await fetchMessagesBefore(apiOpts(), interaction.channelId, { limit: 50 }),
          );
        }
      } catch (e) {
        console.warn("discord: thread history for a command failed — continuing without it:", e);
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
    await args.send(
      [contextBlock, threadContext, ...(result.context ?? []), message].filter((p) => p.length > 0).join("\n\n"),
      {
        auth,
        continuationToken: discordContinuationToken(
          interaction.channelId,
          opts.conversationId ? opts.conversationId(interaction) : interaction.id,
        ),
        state,
      },
    );
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
    // Open question (postQuestion): the "Answer" button opens a text modal;
    // the submit resumes the session as a message (see handleModal).
    if (interaction.customId === QUESTION_CUSTOM_ID) {
      const prompt = readMessageContent(interaction.raw);
      return discordJsonBody({
        type: DISCORD_INTERACTION_RESPONSE_TYPE.MODAL,
        data: {
          custom_id: QUESTION_MODAL_CUSTOM_ID,
          title: (prompt ?? "Your answer").slice(0, 45),
          components: [{
            type: 1, // action row
            components: [{
              type: 4, // text input
              custom_id: QUESTION_TEXT_INPUT_ID,
              label: "Answer",
              style: 2, // paragraph
              min_length: 1,
              max_length: 4000,
              placeholder: "Type your answer here...",
              required: true,
            }],
          }],
        },
      });
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
    // Open-question answer (postQuestion): resume the parked session with the
    // typed text as a message — mirror of the CHOICE_CUSTOM_ID pick above.
    // Free text cannot ride the verb-restricted HITL approval resume.
    if (interaction.customId === QUESTION_MODAL_CUSTOM_ID) {
      const text = interaction.textInputs[QUESTION_TEXT_INPUT_ID]?.trim();
      if (text) {
        await args.send(`Answer: ${text}`, {
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
      return discordJson({ content: "Answer received.", ephemeral: true });
    }
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

  // Per-worker channel snapshot cache: thread kind/owner is immutable for our
  // purposes (a thread never changes owner), so a Map without eviction is fine.
  const channelSnapshots = new Map<string, DiscordChannelSnapshot>();
  // guildId → the bot's managed role id (or null when the guild has none).
  const botRoleIds = new Map<string, string | null>();

  async function handleMessage(event: NonNullable<ReturnType<typeof parseDiscordMessageEvent>>, args: ChannelRouteArgs): Promise<Response> {
    const ignored = () => discordJsonBody({ ignored: true });
    if (event.author.bot) return ignored();

    const applicationId = await resolveDiscordApplicationId(opts.credentials?.applicationId);
    let snapshot: DiscordChannelSnapshot;
    try {
      snapshot = await getChannelSnapshot(apiOpts(), event.channelId, channelSnapshots);
    } catch (e) {
      console.warn("discord: channel snapshot fetch failed — message dropped:", e);
      return ignored();
    }

    // Allow-list before any send(); thread parent satisfies the conversation
    // check, same as the interactions route. Silent on miss (no reply spam).
    const allow = opts.allow ?? envAllowList("DISCORD");
    if (
      !channelAllows(allow, {
        userId: event.author.id,
        conversationId: event.channelId,
        ...(snapshot.parentId ? { conversationParentId: snapshot.parentId } : {}),
      })
    ) return ignored();

    // The bot's managed role, so "@trex" (the auto-created role) is a mention
    // too — Discord autocomplete often picks the role over the bot user.
    let botRoleId: string | undefined;
    if (event.guildId) {
      try {
        botRoleId = (await resolveBotManagedRoleId(apiOpts(), event.guildId, applicationId, botRoleIds)) ?? undefined;
      } catch (e) {
        console.warn("discord: bot role resolution failed — role mentions won't trigger for this message:", e);
      }
    }

    const trigger = decideMessageTrigger({ event, applicationId, channel: snapshot, botRoleId });
    if (trigger.kind === "ignore") return ignored();

    const auth: ChannelAuth = {
      authenticator: "discord",
      principalType: "user",
      principalId: event.author.id,
      attributes: { username: event.author.username, ...(event.guildId ? { guildId: event.guildId } : {}) },
    };
    const text = stripBotMention(event.content, applicationId, botRoleId);
    const contextBlock = formatDiscordMessageContextBlock({
      userId: event.author.id,
      username: event.author.username,
      channelId: event.channelId,
      guildId: event.guildId,
      messageId: event.id,
    });
    const sendToThread = (threadId: string, parts: string[], title?: string) =>
      args.send(parts.filter((p) => p.length > 0).join("\n\n"), {
        auth,
        continuationToken: discordContinuationToken(threadId, threadId),
        state: {
          channelId: threadId,
          applicationId,
          guildId: event.guildId ?? null,
          initialResponseSent: true,
          ephemeral: false,
        } satisfies DiscordDeliveryState,
        ...(title ? { title } : {}),
      });
    const history = async (channelId: string, limit: number): Promise<HistoryMessage[]> => {
      try {
        return await fetchMessagesBefore(apiOpts(), channelId, { before: event.id, limit });
      } catch (e) {
        console.warn("discord: history fetch failed — continuing without context block:", e);
        return [];
      }
    };

    // Attachment metadata rides along as a structured block (never content):
    // the agent relays the files onward (askCodeAgent attachments) untouched.
    const attachmentsBlock = formatAttachmentsBlock(event.attachments);

    if (trigger.kind === "thread-turn") {
      // Every prior human message already drove its own turn — no history block.
      await sendToThread(event.channelId, [contextBlock, attachmentsBlock, text || event.content]);
      return ignored();
    }
    if (trigger.kind === "mention-in-thread") {
      const block = formatMessagesBlock("thread_messages", await history(event.channelId, 50));
      await sendToThread(event.channelId, [contextBlock, block, attachmentsBlock, text]);
      return ignored();
    }
    // mention-in-channel: task thread anchored to the mention message, falling
    // back to a plain thread, falling back to an in-channel session.
    const threadName = threadNameForTask(text);
    let threadId: string | null = null;
    try {
      threadId = (await createDiscordThreadFromMessage({
        ...apiOpts(),
        channelId: event.channelId,
        messageId: event.id,
        name: threadName,
      })).id;
    } catch {
      try {
        threadId = (await createDiscordThread({ ...apiOpts(), channelId: event.channelId, name: threadName })).id;
      } catch (e) {
        console.warn("discord: mention-thread creation failed — falling back to in-channel session:", e);
      }
    }
    const block = formatMessagesBlock("channel_messages", await history(event.channelId, 20));
    if (threadId !== null) {
      // The context block tells the agent "the current channel id", which its explicit
      // post tools (postChoice/postPlan/postScreenshots) target directly. For a task
      // thread that must be the THREAD id, not the parent channel — otherwise those posts
      // land in the main channel even though the session's own deliveries go to the thread.
      const threadContextBlock = formatDiscordMessageContextBlock({
        userId: event.author.id,
        username: event.author.username,
        channelId: threadId,
        guildId: event.guildId,
        messageId: event.id,
      });
      await sendToThread(threadId, [threadContextBlock, block, attachmentsBlock, text], threadName);
    } else {
      await args.send([contextBlock, block, attachmentsBlock, text].filter((p) => p.length > 0).join("\n\n"), {
        auth,
        continuationToken: discordContinuationToken(event.channelId, event.channelId),
        state: {
          channelId: event.channelId,
          applicationId,
          guildId: event.guildId ?? null,
          initialResponseSent: true,
          ephemeral: false,
        } satisfies DiscordDeliveryState,
      });
    }
    return ignored();
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

  const routes = [
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
  ];
  if (opts.messages === true) {
    const messagesPath = route === "/" ? "/messages" : `${route.replace(/\/+$/, "")}/messages`;
    routes.push(POST(messagesPath, async (req, args) => {
      // SIGNATURE FIRST — only the gateway loopback signer can pass this gate.
      const rawBody = await verifyDiscordInbound(req, opts.credentials);
      if (rawBody === null) return new Response("unauthorized", { status: 401 });
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return discordJsonBody({ ignored: true });
      }
      const event = parseDiscordMessageEvent(payload);
      if (event === null) return discordJsonBody({ ignored: true });
      return handleMessage(event, args);
    }));
  }
  return defineChannel({ events, routes });
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
