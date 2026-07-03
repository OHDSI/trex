import { defineTool } from "eve/tools";

export default defineTool({
  description: "Uppercase the given text.",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
  execute: (input) => Promise.resolve({ shouted: (input as { text: string }).text.toUpperCase() }),
});
