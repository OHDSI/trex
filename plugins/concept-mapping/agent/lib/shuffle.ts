// Deterministic candidate orders for the judges. Each judge sees the same
// candidates in a different order so position bias does not make the vote
// look unanimous. Permutation 0 keeps the retrieval order.

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededPermutations<T>(items: T[], seed: string, n: number): T[][] {
  const out: T[][] = [[...items]];
  for (let k = 1; k < n; k++) {
    const next = rng(hash32(`${seed}#${k}`));
    const p = [...items];
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    out.push(p);
  }
  return out;
}
