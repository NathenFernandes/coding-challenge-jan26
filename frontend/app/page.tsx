import { cookies } from "next/headers";
import { ClementineConsole } from "@/components/clementine/clementine-console";
import {
  getActiveProfile,
  listConversationMessages,
  getLatestMatchRun,
} from "@/lib/server/repository";
import { CLERA_SESSION_COOKIE } from "@/lib/server/session";
import type { AgentChatMessage } from "@/lib/shared/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(CLERA_SESSION_COOKIE)?.value;

  let initialProfile = null;
  let initialMatch = null;
  let initialMessages: AgentChatMessage[] = [];

  if (sessionId) {
    try {
      [initialProfile, initialMatch, initialMessages] = await Promise.all([
        getActiveProfile(sessionId),
        getLatestMatchRun(sessionId),
        listConversationMessages(sessionId),
      ]);
    } catch {
      initialProfile = null;
      initialMatch = null;
      initialMessages = [];
    }
  }

  return (
    <ClementineConsole
      sessionId={sessionId ?? null}
      initialMatch={initialMatch}
      initialMessages={initialMessages}
      initialProfile={initialProfile}
    />
  );
}
