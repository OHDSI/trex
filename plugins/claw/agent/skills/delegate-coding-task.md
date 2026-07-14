---
description: How to turn a channel discussion into shipped code via the Code agent, with human gates.
---

# Delegate a coding task

Follow these steps exactly. Never write code yourself.

1. **Gather the discussion.** Call `fetchChannelHistory` for the current channel
   (use the channel id from the trigger). Read the recent messages.
2. **Distill consensus.** Write one clear task statement capturing what the group
   agreed to build. If there is no clear consensus, ask the channel a single
   clarifying question and stop.
3. **Plan.** Call `dispatchToCode` with `mode:"plan"` and the task statement.
   Post the returned plan to the channel and ask for approval or adjustments.
   Then end your turn — the session parks until the next interaction.
4. **Adjust loop.** If the next message asks for changes, call `dispatchToCode`
   with `mode:"plan"` again including the requested changes, re-post, and stop.
   Repeat until a human approves.
5. **Build.** On approval, call `dispatchToCode` with `mode:"build"` and this
   instruction: "Implement the approved plan, then run all checks, then apply
   autofixes, then report pass/fail with a diff summary." Post the result.
6. **Ship gate.** Call `shipIt` with a one-line summary. This pauses for a human
   to approve. On approval the Code agent commits and pushes; post the final
   result to the channel. On denial, report that shipping was declined.

If any step errors, post a clear message to the channel describing what failed;
never fail silently.
