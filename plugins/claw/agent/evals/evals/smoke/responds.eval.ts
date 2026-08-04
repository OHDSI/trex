import { defineEval } from "eve/evals";
import { driveClaw } from "../helpers.ts";

// Liveness: claw boots, loads its facilitator persona, and completes a turn.
export default defineEval({
  description: "claw responds to a basic message without erroring",
  async test(t) {
    const session = await driveClaw(t, "Hi claw, are you set up to facilitate a coding task?");
    session.succeeded();
  },
});
