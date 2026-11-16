import { assert, assertEquals, assertMatch } from "jsr:@std/assert";
import { extractCsv, parseSourceCsv, SUBMISSION_HEADER, serializeSubmissionCsv } from "./csv.ts";

const HEADER = "source_data_identifier,source_code,original_source_name,source_name";

Deno.test("parses BOM, CRLF, quoted fields and Greek text", () => {
  const text = "﻿" + HEADER + "\r\n" +
    '1,T000700,ΔΟΚΙΜΑΣΤΙΚΗ ΘΕΡΑΠΕΙΑ,SOLO TALK THERAPY\r\n' +
    '2,AB1,"a, ""b""","x, y"\r\n';
  const { rows, errors } = parseSourceCsv(text);
  assertEquals(errors, []);
  assertEquals(rows.length, 2);
  assertEquals(rows[0], {
    rowIndex: 0,
    sourceDataIdentifier: "1",
    sourceCode: "T000700",
    originalSourceName: "ΔΟΚΙΜΑΣΤΙΚΗ ΘΕΡΑΠΕΙΑ",
    sourceName: "SOLO TALK THERAPY",
  });
  assertEquals(rows[1].originalSourceName, 'a, "b"');
  assertEquals(rows[1].sourceName, "x, y");
});

Deno.test("accepts an empty source_name when original_source_name is present", () => {
  const { rows, errors } = parseSourceCsv(HEADER + "\n1,C1,Hüftprothese,\n");
  assertEquals(errors, []);
  assertEquals(rows[0].sourceName, "");
});

Deno.test("rejects a row with both names empty, naming the 1-based data row", () => {
  const { errors } = parseSourceCsv(HEADER + "\n1,C1,a,b\n1,C2,b,c\n1,C3,,\n");
  assertEquals(errors.length, 1);
  assertMatch(errors[0], /row 3: source_name and original_source_name both empty/);
});

Deno.test("reports a missing required column by name", () => {
  const { errors } = parseSourceCsv("source_data_identifier,source_code,source_name\n1,C1,x\n");
  assert(errors.some((e) => e.includes("original_source_name")), errors.join("; "));
});

Deno.test("serializes the exact submission header and round-trips quoting", () => {
  const csv = serializeSubmissionCsv([{
    rowIndex: 0,
    sourceDataIdentifier: "1",
    sourceCode: "C1",
    originalSourceName: 'a, "b"',
    sourceName: "x",
    targetConceptId: 9000201,
    targetConceptName: "Solo talk therapy",
    predicate: "exactMatch",
  }]);
  const [header, line] = csv.trimEnd().split("\n");
  assertEquals(header, SUBMISSION_HEADER);
  assertEquals(
    SUBMISSION_HEADER,
    "source_data_identifier,source_code,original_source_name,source_name,target_concept_id,target_concept_name,alternative_target_concept_id,alternative_target_concept_name,predicate",
  );
  assertEquals(line, '1,C1,"a, ""b""",x,9000201,Solo talk therapy,,,exactMatch');
});

Deno.test("skips delimiter-only lines such as Excel's trailing ,,, rows", () => {
  const { rows, errors } = parseSourceCsv(HEADER + "\n1,C1,a,b\n,,,\n,,,\n");
  assertEquals(errors, []);
  assertEquals(rows.length, 1);
});

Deno.test("extractCsv pulls the CSV out of a chat message", () => {
  const text = "Please map these:\n\n```csv\n" + HEADER + "\n1,C1,a,b\n```\nThanks!";
  assertEquals(extractCsv(text), HEADER + "\n1,C1,a,b\n");
  assertEquals(extractCsv("no csv here"), null);
});
