export interface SurrealConfig {
  url: string;
  namespace: string;
  database: string;
  username?: string;
  password?: string;
  token?: string;
}

export interface SurrealStatementResult<T = unknown> {
  status?: string;
  result?: T;
  detail?: string;
}

function encodeBasicAuth(username: string, password: string): string {
  if (typeof btoa === "function") {
    return `Basic ${btoa(`${username}:${password}`)}`;
  }

  if ("Buffer" in globalThis && typeof globalThis.Buffer.from === "function") {
    return `Basic ${globalThis.Buffer.from(`${username}:${password}`).toString("base64")}`;
  }

  throw new Error("Basic auth encoding is unavailable in this runtime.");
}

function buildHeaders(config: SurrealConfig): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "text/plain",
    "Surreal-NS": config.namespace,
    "Surreal-DB": config.database,
  };

  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  } else if (config.username && config.password) {
    headers.Authorization = encodeBasicAuth(config.username, config.password);
  }

  return headers;
}

export function surrealLiteral(value: unknown): string {
  return JSON.stringify(value);
}

function surrealIdentifier(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid Surreal identifier: ${value}`);
  }

  return value;
}

export async function runSurrealQuery<T = unknown>(
  config: SurrealConfig,
  query: string,
): Promise<SurrealStatementResult<T>[]> {
  const response = await fetch(`${config.url.replace(/\/$/, "")}/sql`, {
    method: "POST",
    headers: buildHeaders(config),
    body: query,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SurrealDB query failed (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected SurrealDB response shape.");
  }

  return payload as SurrealStatementResult<T>[];
}

export function extractResult<T>(
  results: SurrealStatementResult<T>[],
  index = 0,
): T {
  const statement = results[index];
  if (!statement) {
    throw new Error("Missing SurrealDB statement result.");
  }

  if (statement.status && statement.status !== "OK") {
    throw new Error(statement.detail || "SurrealDB statement failed.");
  }

  return statement.result as T;
}

export async function ensureSurrealSchema(config: SurrealConfig): Promise<void> {
  const namespace = surrealIdentifier(config.namespace);
  const database = surrealIdentifier(config.database);

  await runSurrealQuery(config, `
    DEFINE NAMESPACE IF NOT EXISTS ${namespace};
    DEFINE DATABASE IF NOT EXISTS ${database};
    DEFINE TABLE IF NOT EXISTS fruit SCHEMALESS;
    DEFINE TABLE IF NOT EXISTS match_run SCHEMALESS;
    DEFINE TABLE IF NOT EXISTS message SCHEMALESS;
    DEFINE TABLE IF NOT EXISTS agent_turn SCHEMALESS;
    DEFINE TABLE IF NOT EXISTS agent_turn_event SCHEMALESS;
    DEFINE INDEX IF NOT EXISTS fruit_type ON TABLE fruit FIELDS type;
    DEFINE INDEX IF NOT EXISTS fruit_source ON TABLE fruit FIELDS source;
    DEFINE INDEX IF NOT EXISTS fruit_session_active ON TABLE fruit FIELDS sessionId, active;
    REMOVE INDEX IF EXISTS fruit_self_embedding_hnsw ON TABLE fruit;
    REMOVE INDEX IF EXISTS fruit_looking_for_embedding_hnsw ON TABLE fruit;
    DEFINE INDEX fruit_self_embedding_hnsw
      ON TABLE fruit FIELDS selfEmbedding
      HNSW DIMENSION 256 DIST COSINE;
    DEFINE INDEX fruit_looking_for_embedding_hnsw
      ON TABLE fruit FIELDS lookingForEmbedding
      HNSW DIMENSION 256 DIST COSINE;
    DEFINE INDEX IF NOT EXISTS match_run_session_created ON TABLE match_run FIELDS sessionId, createdAt;
    DEFINE INDEX IF NOT EXISTS match_run_created ON TABLE match_run FIELDS createdAt;
    DEFINE INDEX IF NOT EXISTS message_session_created ON TABLE message FIELDS sessionId, createdAt;
    DEFINE INDEX IF NOT EXISTS message_messageId ON TABLE message FIELDS messageId UNIQUE;
    DEFINE INDEX IF NOT EXISTS agent_turn_session_created ON TABLE agent_turn FIELDS sessionId, createdAt;
    DEFINE INDEX IF NOT EXISTS agent_turn_status ON TABLE agent_turn FIELDS status;
    DEFINE INDEX IF NOT EXISTS agent_turn_event_turn_sequence ON TABLE agent_turn_event FIELDS turnId, sequence;
  `);
}
