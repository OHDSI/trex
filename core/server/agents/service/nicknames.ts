// A stable, human-legible handle per child. "Kepler finished, Faraday is
// still running" is materially easier to follow than six uuid prefixes.
//
// Inlined rather than loaded via `with { type: "text" }`: that import
// attribute needs --unstable-raw-imports on this Deno version, which the
// standard `deno test --allow-all` invocation used across this repo does not
// pass. The list is 30 short strings, so inlining costs nothing.
export const AGENT_NAMES: readonly string[] = Object.freeze([
  "Euclid", "Archimedes", "Ptolemy", "Hypatia", "Avicenna", "Averroes",
  "Aquinas", "Copernicus", "Kepler", "Galileo", "Bacon", "Descartes",
  "Pascal", "Fermat", "Huygens", "Leibniz", "Newton", "Halley", "Euler",
  "Lagrange", "Laplace", "Volta", "Gauss", "Ampere", "Faraday", "Darwin",
  "Lovelace", "Boole", "Pasteur", "Maxwell",
]);

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** First unused name; on wraparound, "<name> the Nth". */
export function pickNickname(taken: string[]): string {
  const used = new Set(taken);
  for (let lap = 1; ; lap++) {
    for (const base of AGENT_NAMES) {
      const candidate = lap === 1 ? base : `${base} the ${ordinal(lap)}`;
      if (!used.has(candidate)) return candidate;
    }
  }
}
