// @ts-nocheck - Deno edge function
import type { ToolDefinition, AgentContext } from "./types.ts";

export const generateImageTool: ToolDefinition = {
  name: "GenerateImage",
  description: "Generate an image using DALL-E. Provide a detailed prompt describing the desired image. The image will be saved to the workspace.",
  modifiesState: true,
  defaultConsent: "ask",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Detailed description of the image to generate" },
      filename: { type: "string", description: "Filename to save the image as (e.g. 'hero-image.png')" },
      size: { type: "string", description: "Image size: '1024x1024', '1024x1792', or '1792x1024'" },
    },
    required: ["prompt", "filename"],
  },
  async execute(args: { prompt: string; filename: string; size?: string }, ctx: AgentContext) {
    const size = args.size || "1024x1024";
    // Get OpenAI API key from settings or env
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return "Error: OPENAI_API_KEY environment variable not set. Cannot generate images.";
    }

    try {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: args.prompt,
          n: 1,
          size,
          response_format: "b64_json",
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return `Image generation failed: ${err}`;
      }

      const data = await response.json();
      const b64 = data.data[0].b64_json;
      const imageBytes = Uint8Array.from(atob(b64), (c: string) => c.charCodeAt(0));

      // Save to workspace
      const filePath = `${ctx.workspacePath}/${args.filename}`;
      await Deno.writeFile(filePath, imageBytes);

      return `Image generated and saved to ${args.filename} (${size}). Revised prompt: ${data.data[0].revised_prompt || args.prompt}`;
    } catch (err) {
      return `Image generation error: ${err.message}`;
    }
  },
};
