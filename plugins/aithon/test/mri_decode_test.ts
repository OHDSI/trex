// @ts-nocheck
import { assertEquals } from "std/assert/mod.ts";
import { decodeMriQuery, encodeMriQuery } from "../functions-mri/mriquery/decode.ts";

Deno.test("decode round-trips an encoded IFR (zlib + base64)", async () => {
  const ifr = { filter: { configMetadata: { id: "fhir-ds1", version: "1" }, cards: { type: "BooleanContainer", op: "AND", content: [] } }, axisSelection: [] };
  const encoded = await encodeMriQuery(ifr);
  const decoded = await decodeMriQuery(encoded);
  assertEquals(decoded, ifr);
});

Deno.test("decode accepts plain (uncompressed) JSON too", async () => {
  const ifr = { filter: { configMetadata: { id: "x", version: "1" }, cards: { type: "BooleanContainer", op: "AND", content: [] } }, axisSelection: [] };
  const decoded = await decodeMriQuery(JSON.stringify(ifr));
  assertEquals(decoded.filter.configMetadata.id, "x");
});
