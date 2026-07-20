---
description: Use during the design gate when a UI/visual decision would land better as pictures, OR when the team asks just for mockups/design ideas — have the coder mock the options up as prototype screens, screenshot them, and post the PNGs to the channel BEFORE asking the team to pick.
---

# Present design options as mockups

At Gate 1 (design/brainstorm) a visual decision — a layout, a component design,
a style direction, an empty state — lands far better as images than as prose:
the team picks between things they can see instead of guessing from
descriptions. Use this flow whenever the options are visual; for conceptual
choices (API shape, data model, scope) stay with plain `postChoice`.

## Flow

1. `postUpdate` a one-liner ("Sketching the options as mockups, back shortly.")
   — the mockup hand-off takes a while and the channel should not sit silent.
2. One `askCodeAgent` hand-off, mockups + screenshots together:

   > Run your brainstorming skill's visual companion to mock up each design
   > option as its own prototype screen (`prototypes/<option-slug>/index.html`,
   > realistic content, one screen per option). Then use your
   > screenshotting-mockups skill to capture a PNG of each into
   > `trex/screenshots/`. Do NOT implement anything and do NOT run any other
   > skill — stop after capturing, and report each option's name, a one-line
   > trade-off, and its screenshot path in your reply.

3. `postScreenshots` with the current `channelId` and the reported paths; use
   the `caption` to map image order to option names ("1: sidebar layout,
   2: toolbar layout") — Discord shows the images without filenames.
4. THEN `postChoice` with the same option names (plus "Something else" when the
   list may be incomplete). Same principle as the post-implementation gates:
   the team decides with the pictures already in front of them, so the
   screenshots must land before the question. The pick resumes your session —
   carry the chosen option into Gate 2 as usual.

## Mockups-only asks

Sometimes the mockups ARE the task: "@trex show us some layout ideas for X",
"mock up a few directions for the empty state". Run the same flow (steps 1-4;
still pick a target app so the mockups land in the right workspace), but the
posted screenshots and the team's pick are the DELIVERABLE, not a gate:

- After the pick (or the feedback), confirm the chosen direction in one line
  and stop — do NOT proceed to Gate 2, planning, or implementation.
- Offer the next step instead of taking it: "Want me to build the sidebar
  version? Say the word and I'll plan it." A later "yes, build it" enters the
  normal facilitation flow at Gate 2, with the chosen mockup as the approved
  direction (Gate 1 is already settled by the pick).
- If the ask is exploratory with no decision to make ("just show us some
  ideas"), skip the `postChoice` and end after `postScreenshots` — invite
  reactions in plain language instead of forcing a dropdown.

## Notes

- The mockups are throwaway design artifacts. Do not present them as the
  implementation, and make sure the coder keeps `prototypes/` and the PNGs out
  of the feature branch's commits.
- If the coder reports it could not screenshot (missing browser, broken
  workspace), post the options as a `postPlan` text fallback and say the images
  could not be produced — never silently skip the gate.
- Iterations after feedback: new screens get `-v2` names; re-run the same flow
  and post only the changed screens.
