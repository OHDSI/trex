// Role-assignment parsing. No database, no express: a pure function of its
// input so it can be tested directly.

export function parseRoleAssignment(body: unknown): { userId: string; role: string } | null {
  if (!body || typeof body !== "object") return null;
  const { userId, role } = body as Record<string, unknown>;
  if (typeof userId !== "string" || typeof role !== "string") return null;
  const trimmedUser = userId.trim();
  const trimmedRole = role.trim();
  if (!trimmedUser || !trimmedRole) return null;
  return { userId: trimmedUser, role: trimmedRole };
}
