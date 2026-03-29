import type { SurrealConfig } from "../../../supabase/functions/_shared/surreal";

export function getSurrealConfig(): SurrealConfig {
  return {
    url: process.env.SURREALDB_URL ?? "http://127.0.0.1:8000",
    namespace: process.env.SURREALDB_NAMESPACE ?? "clera",
    database: process.env.SURREALDB_DATABASE ?? "matchmaking",
    username: process.env.SURREALDB_USERNAME ?? "root",
    password: process.env.SURREALDB_PASSWORD ?? "root",
  };
}

export function getSupabaseFunctionsUrl(): string {
  return process.env.SUPABASE_FUNCTIONS_URL ?? "http://127.0.0.1:54321/functions/v1";
}

export function getSupabaseAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY
    ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
}

export function hasTriggerKey(): boolean {
  return Boolean(process.env.TRIGGER_SECRET_KEY);
}

export function getAgentModel(): string {
  return process.env.AI_MODEL ?? "anthropic/claude-sonnet-4.6";
}

export function getEmbeddingModel(): string {
  return process.env.EMBEDDING_MODEL ?? "openai/text-embedding-3-small";
}

export function hasGatewayKey(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}
