import { cookies } from "next/headers";
import { getAgentSessionSnapshot } from "@/lib/server/repository";
import { CLERA_SESSION_COOKIE } from "@/lib/server/session";

export async function GET(): Promise<Response> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(CLERA_SESSION_COOKIE)?.value;

  if (!sessionId) {
    return Response.json(
      {
        error: "Missing session",
      },
      { status: 401 },
    );
  }

  try {
    const snapshot = await getAgentSessionSnapshot(sessionId);
    return Response.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load agent snapshot.";
    return Response.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
