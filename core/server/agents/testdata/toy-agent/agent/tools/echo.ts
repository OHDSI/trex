import { defineTool } from "eve/tools";

export default defineTool({
  description: "Echo the given text back.",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
  execute: (input) => Promise.resolve({ echoed: (input as { text: string }).text }),
});
