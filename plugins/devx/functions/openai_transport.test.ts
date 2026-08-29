// @ts-nocheck - Deno edge function
import { assertEquals } from "jsr:@std/assert";
import { openaiTransport } from "./openai_transport.ts";

Deno.test("plain OpenAI uses chat completions", () => {
  assertEquals(openaiTransport(undefined), "chat");
  assertEquals(openaiTransport(""), "chat");
});

Deno.test("an OpenAI-compatible gateway also uses chat completions — the widest-supported surface", () => {
  assertEquals(openaiTransport("https://bedrock-mantle.us-east-1.api.aws/openai/v1"), "chat");
  assertEquals(openaiTransport("http://llama-qwen:8080/v1"), "chat");
});
