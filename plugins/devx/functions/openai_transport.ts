// @ts-nocheck - Deno edge function
// Which OpenAI wire protocol the coder speaks.
//
// AI SDK 5's `openai(model)` defaults to the Responses API. Chat Completions is
// the surface every OpenAI-compatible gateway implements (llama.cpp, vLLM,
// Bedrock's openai/v1 shim), and a silent multi-minute hang driving GPT models
// over the Responses API has already been observed in this deployment on a
// neighbouring agent runtime. A single named function so the choice is visible
// and reversible, rather than an undocumented `.chat` buried in createModel.
export function openaiTransport(_baseUrl?: string): "chat" | "responses" {
  return "chat";
}
