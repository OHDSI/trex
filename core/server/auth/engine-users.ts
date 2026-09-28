import { isPlaceholderAddress } from "./engine-address.ts";

export interface EngineUserInput {
  email: string;
  password?: string;
  name: string;
  role: string;
  userMetadata?: Record<string, unknown>;
  // /signup registers the address holder, so it is the one route that does not flag.
  flagPlaceholder?: boolean;
}

export async function createEngineUser(input: EngineUserInput): Promise<{ id: string; email: string }> {
  const { auth } = await import("./better-auth.ts");
  const synthetic = (input.flagPlaceholder ?? true) && isPlaceholderAddress(input.email);
  const created = await auth.api.createUser({
    body: {
      email: input.email,
      ...(input.password !== undefined ? { password: input.password } : {}),
      name: input.name,
      role: input.role as "user" | "admin",
      data: {
        emailVerified: !synthetic,
        ...(synthetic ? {} : { email_confirmed_at: new Date() }),
        is_placeholder_email: synthetic,
        user_metadata: input.userMetadata ?? {},
      },
    },
  });
  return { id: created.user.id, email: created.user.email };
}
