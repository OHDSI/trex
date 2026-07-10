import { defineTool } from "eve/tools";

export default defineTool({
  description: "Propose a card for the user to accept or reject (rendered client-side).",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
  },
  clientOnly: true,
});
