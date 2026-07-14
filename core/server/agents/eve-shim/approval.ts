// The "eve/tools/approval" authoring surface. `once()` marks an approval as
// one-shot: the model must obtain consent the first time, and the decision
// sticks for the remainder of the session. Kept as a tiny string-returning
// helper (matching eve's authoring API) so `approval: once()` reads naturally
// on a tool or connection definition; the runtime interprets the "once"
// literal (Task 2+).
export const once = (): "once" => "once";
