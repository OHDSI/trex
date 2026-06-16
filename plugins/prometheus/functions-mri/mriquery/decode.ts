// @ts-nocheck - Deno edge function
import { Ifr } from "../ifr/types.ts";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const stream = new Response(bytes).body.pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const stream = new Response(bytes).body.pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Decode an mriquery value: tries plain JSON, then base64+zlib(deflate). */
export async function decodeMriQuery(value: string): Promise<Ifr> {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as Ifr;
  const bytes = b64ToBytes(trimmed);
  const inflated = await inflate(bytes);
  return JSON.parse(new TextDecoder().decode(inflated)) as Ifr;
}

/** Test/helper: encode an IFR the way the frontend does (base64 of deflate). */
export async function encodeMriQuery(ifr: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(ifr));
  return bytesToB64(await deflate(json));
}
