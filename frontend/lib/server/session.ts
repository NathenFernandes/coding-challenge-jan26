export const CLERA_SESSION_COOKIE = "clera_session_id";

export function createSessionId(): string {
  return crypto.randomUUID();
}
