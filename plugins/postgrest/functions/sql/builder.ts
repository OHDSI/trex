// SqlSnippet builder — the TS stand-in for Hasql.DynamicStatements.Snippet.
//
// Upstream composes queries as `SQL.Snippet` values: SQL text interleaved
// with parameters (`SQL.encoderAndParam (HE.nonNullable HE.unknown)`), which
// Hasql later numbers $1..$n in order of appearance. This module reproduces
// that model so the ported fragment functions read like the Haskell: they
// concatenate snippets and never deal with parameter numbering.

/** A parameter placeholder carrying its value (Hasql's encoderAndParam);
 * null mirrors a nullable encoder's Nothing. */
export interface SnippetParam {
  readonly param: string | null;
}

export type SnippetPart = string | SnippetParam;

/** A composable piece of SQL text + ordered parameters. */
export class Snippet {
  readonly parts: readonly SnippetPart[];

  constructor(parts: readonly SnippetPart[]) {
    this.parts = parts;
  }
}

/** Snippet mempty. */
export const emptySnippet = new Snippet([]);

/** Raw SQL text (Haskell's OverloadedStrings / SQL.sql). */
export function sql(text: string): Snippet {
  return text === "" ? emptySnippet : new Snippet([text]);
}

/** A `$n` placeholder bound to `value` (SqlFragment.hs unknownEncoder). */
export function param(value: string | null): Snippet {
  return new Snippet([{ param: value }]);
}

/** Snippet concatenation (Haskell `<>`); bare strings are raw SQL. */
export function snip(...pieces: (Snippet | string)[]): Snippet {
  const parts: SnippetPart[] = [];
  for (const piece of pieces) {
    if (typeof piece === "string") {
      if (piece !== "") parts.push(piece);
    } else {
      parts.push(...piece.parts);
    }
  }
  return new Snippet(parts);
}

/** Ports SqlFragment.hs intercalateSnippet. */
export function intercalateSnippet(frag: string, snippets: Snippet[]): Snippet {
  if (snippets.length === 0) return emptySnippet;
  const parts: SnippetPart[] = [];
  snippets.forEach((s, i) => {
    if (i > 0) parts.push(frag);
    parts.push(...s.parts);
  });
  return new Snippet(parts);
}

export interface RenderedSnippet {
  text: string;
  values: (string | null)[];
}

/**
 * Renders the snippet to a parameterized statement: parameters are numbered
 * $1..$n in order of appearance, like Hasql's dynamicallyParameterized.
 */
export function renderSnippet(snippet: Snippet): RenderedSnippet {
  let text = "";
  const values: (string | null)[] = [];
  for (const part of snippet.parts) {
    if (typeof part === "string") {
      text += part;
    } else {
      values.push(part.param);
      text += `$${values.length}`;
    }
  }
  return { text, values };
}
