export interface QItem {
  linkId: string; text?: string; type: string; required?: boolean; repeats?: boolean;
  answerOption?: Array<{ valueString?: string; valueCoding?: { code: string; display?: string } }>;
  enableWhen?: Array<{ question: string; operator: string; answerString?: string; answerBoolean?: boolean; answerInteger?: number }>;
  enableBehavior?: "all" | "any";
  item?: QItem[];
}

export function isEnabled(item: QItem, answers: Record<string, any>): boolean {
  if (!item.enableWhen?.length) return true;
  const check = (c: NonNullable<QItem["enableWhen"]>[number]) => {
    const actual = answers[c.question];
    const expected = c.answerString ?? c.answerBoolean ?? c.answerInteger;
    switch (c.operator) {
      case "=": return actual === expected;
      case "!=": return actual !== expected;
      case "exists": return (actual != null) === (c.answerBoolean ?? true);
      default: return true;
    }
  };
  return item.enableBehavior === "any"
    ? item.enableWhen.some(check)
    : item.enableWhen.every(check);
}
