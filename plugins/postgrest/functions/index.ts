// @trex/postgrest worker entrypoint.
import { handle } from "./app.ts";

Deno.serve((req) => handle(req));
