// Head/tail truncation for tool output. `maxChars` bounds RETAINED CONTENT;
// the warning header and omission marker are additional (see the design doc's
// "Truncation format" section — budget.ts accounts for the overhead).
export const TRUNCATION_HEADER_OVERHEAD = 120;

export function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars / 2);
  const tail = maxChars - head;
  const omitted = text.length - maxChars;
  const lines = (text.match(/\n/g) || []).length;
  return (
    `Warning: truncated output (original length: ${text.length} chars, ${lines} lines)\n\n` +
    text.slice(0, head) +
    `\n\n[... ${omitted} chars omitted ...]\n\n` +
    text.slice(text.length - tail)
  );
}
