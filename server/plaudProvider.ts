import { randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import {
  OAuthClientInformationFullSchema,
  OAuthTokensSchema,
  type OAuthClientInformationMixed,
  type OAuthClientMetadata,
  type OAuthMetadata,
  type OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type {
  PlaudConnectionStatus,
  PlaudFetchedRecording,
  PlaudRecording,
  PlaudRecordingPage,
} from "../shared/plaud";
import {
  PlaudConnectionCrypto,
  PlaudError,
  assertPlaudUser,
  plaudHash,
  plaudSafeError,
} from "./plaudConnectionCrypto";
import {
  PlaudConnectionDb,
  type PlaudConnectionRow,
  type PlaudConnectionStore,
} from "./plaudConnectionDb";

export { PlaudError } from "./plaudConnectionCrypto";
export const PLAUD_CALLBACK_URL = "https://elevay.vip/api/plaud/oauth/callback";
const ISSUER = "https://mcp.plaud.ai/";
const MCP_URL = "https://mcp.plaud.ai/mcp";
const RESOURCE_METADATA =
  "https://mcp.plaud.ai/.well-known/oauth-protected-resource";
const METADATA: OAuthMetadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}authorize`,
  token_endpoint: `${ISSUER}token`,
  registration_endpoint: `${ISSUER}register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: [
    "client_secret_basic",
    "client_secret_post",
    "none",
  ],
  code_challenge_methods_supported: ["S256"],
};
const CLIENT_METADATA: OAuthClientMetadata = {
  client_name: "ELEVAY private Plaud connection",
  client_uri: "https://elevay.vip",
  redirect_uris: [PLAUD_CALLBACK_URL],
  token_endpoint_auth_method: "none",
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
};
const STATE_TTL = 10 * 60_000;
const HTTP_TIMEOUT = 15_000;
const LEASE_TTL = 45_000;
const MAX_HTTP_BYTES = 2 * 1024 * 1024;
const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;
const REQUEST_OPTIONS = {
  timeout: 20_000,
  maxTotalTimeout: 20_000,
  resetTimeoutOnProgress: false,
};
const READ_TOOLS = [
  "get_current_user",
  "list_files",
  "get_file",
  "get_transcript",
] as const;
type ReadTool = (typeof READ_TOOLS)[number];
type Credential = {
  v: 1;
  connected: boolean;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  expiresAt?: number | null;
  sourceScope?: string;
  needsReconnect?: boolean;
};
type Pending = {
  v: 1;
  version: number;
  verifier: string;
  returnPath: string;
  client: OAuthClientInformationMixed;
};
type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
  return value as JsonObject;
}
function sourceId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > 255 ||
    /[\x00-\x20\x7f]/.test(value) ||
    /[/:?#\\]/.test(value)
  )
    throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
  return value;
}
export function validatePlaudReturnPath(value: string): string {
  if (value === "/profile") return value;
  const match =
    typeof value === "string" && /^\/leads\/([1-9]\d{0,14})$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1])))
    throw new PlaudError("PLAUD_INVALID_INPUT");
  return value;
}
function validateSession(value: string): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new PlaudError("PLAUD_INVALID_INPUT");
}

/** SSE may remain open after a result. Deliver events immediately, while enforcing
 * a cumulative byte cap and absolute lifetime even if the remote never closes. */
function boundedPlaudSse(
  response: Response,
  controller: AbortController,
  signal?: AbortSignal | null
): Response {
  const reader = response.body?.getReader();
  if (!reader) throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
  let total = 0,
    ended = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  };
  const fail = (error: PlaudError) => {
    if (ended) return;
    ended = true;
    cleanup();
    controller.abort();
    streamController.error(error);
    void reader.cancel().catch(() => {});
  };
  const abort = () => fail(new PlaudError("PLAUD_PROVIDER_UNAVAILABLE"));
  const body = new ReadableStream<Uint8Array>({
    start(target) {
      streamController = target;
      timer = setTimeout(abort, HTTP_TIMEOUT);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    },
    async pull(target) {
      try {
        const chunk = await reader.read();
        if (ended) return;
        if (chunk.done) {
          ended = true;
          cleanup();
          target.close();
          return;
        }
        total += chunk.value.byteLength;
        if (total > MAX_HTTP_BYTES) {
          fail(new PlaudError("PLAUD_RESPONSE_UNSUPPORTED"));
          return;
        }
        target.enqueue(chunk.value);
      } catch {
        fail(new PlaudError("PLAUD_PROVIDER_UNAVAILABLE"));
      }
    },
    cancel() {
      if (!ended) {
        ended = true;
        cleanup();
        controller.abort();
        void reader.cancel().catch(() => {});
      }
    },
  });
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(body, { status: response.status, headers });
}

/** Every SDK request, including OAuth and SSE, passes through this exact origin/path/method
 * allowlist. No redirects, arbitrary resource metadata URLs, link-backed audio fetches or DNS
 * target chosen from provider content are accepted. Response bodies are bounded before parsing. */
export function createPlaudFetch(
  rawFetch: typeof fetch = globalThis.fetch
): typeof fetch {
  return (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    try {
      const request = input instanceof Request ? input : undefined;
      const url = new URL(request ? request.url : String(input));
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      const allowed: Record<string, string[]> = {
        "/.well-known/oauth-protected-resource": ["GET"],
        "/.well-known/oauth-authorization-server": ["GET"],
        "/register": ["POST"],
        "/token": ["POST"],
        "/mcp": ["POST", "GET", "DELETE"],
      };
      if (
        url.origin !== "https://mcp.plaud.ai" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !allowed[url.pathname]?.includes(method)
      )
        throw new PlaudError("PLAUD_NETWORK_REJECTED");
      const controller = new AbortController();
      const signal = init?.signal ?? request?.signal;
      const abort = () => controller.abort();
      if (signal?.aborted) controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new PlaudError("PLAUD_PROVIDER_UNAVAILABLE"));
        }, HTTP_TIMEOUT);
      });
      try {
        return await Promise.race([
          timeout,
          (async () => {
            const response = await rawFetch(input, {
              ...init,
              method,
              redirect: "manual",
              credentials: "omit",
              signal: controller.signal,
            });
            if (response.status >= 300 && response.status < 400) {
              await response.body?.cancel();
              throw new PlaudError("PLAUD_NETWORK_REJECTED");
            }
            if (
              response.redirected ||
              (response.url && new URL(response.url).href !== url.href)
            ) {
              await response.body?.cancel();
              throw new PlaudError("PLAUD_NETWORK_REJECTED");
            }
            if (response.status === 401 || response.status === 403) {
              await response.body?.cancel();
              throw new PlaudError("PLAUD_RECONNECT_REQUIRED");
            }
            const contentLength = response.headers.get("content-length");
            if (
              contentLength &&
              (!/^\d+$/.test(contentLength) ||
                Number(contentLength) > MAX_HTTP_BYTES)
            ) {
              await response.body?.cancel();
              throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
            }
            if (
              response.headers
                .get("content-type")
                ?.split(";")[0]
                .trim()
                .toLowerCase() === "text/event-stream"
            ) {
              if (url.pathname !== "/mcp")
                throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
              return boundedPlaudSse(response, controller, signal);
            }
            const chunks: Uint8Array[] = [];
            let length = 0;
            const reader = response.body?.getReader();
            if (reader) {
              try {
                for (;;) {
                  const chunk = await reader.read();
                  if (chunk.done) break;
                  length += chunk.value.byteLength;
                  if (length > MAX_HTTP_BYTES) {
                    await reader.cancel();
                    throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
                  }
                  chunks.push(chunk.value);
                }
              } finally {
                reader.releaseLock();
              }
            }
            const headers = new Headers(response.headers);
            headers.delete("content-length");
            headers.delete("content-encoding");
            return new Response(
              [204, 205, 304].includes(response.status)
                ? null
                : Buffer.concat(chunks),
              { status: response.status, statusText: "", headers }
            );
          })(),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    } catch (error) {
      throw plaudSafeError(error);
    }
  }) as typeof fetch;
}

/** Parse only the published exact-name wrapper. Provider preamble/trailer is never transcript. */
export function unwrapPlaudToolText(result: unknown, wrapped: boolean): string {
  const envelope = object(result);
  if (envelope.isError === true)
    throw new PlaudError("PLAUD_PROVIDER_UNAVAILABLE");
  if (
    !Array.isArray(envelope.content) ||
    envelope.content.length !== 1 ||
    envelope.structuredContent !== undefined
  )
    throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
  const content = object(envelope.content[0]);
  if (
    content.type !== "text" ||
    typeof content.text !== "string" ||
    Buffer.byteLength(content.text) > MAX_HTTP_BYTES
  )
    throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
  if (!wrapped) return content.text;
  const text = content.text;
  const opening =
    /(?:^|\n)<(untrusted-user-data-[a-f0-9]{16}) source="plaud-recording">\n/.exec(
      text
    );
  if (!opening) throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
  const start = opening.index + opening[0].length,
    closing = `\n</${opening[1]}>`;
  const end = text.indexOf(closing, start);
  if (end < start || text.indexOf(closing, end + closing.length) !== -1)
    throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
  return text.slice(start, end);
}
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
  }
}
export function plaudSourceScope(value: unknown): string {
  const user = object(value);
  // Both fields have official source references. Missing workspace cannot be guessed as
  // "personal" or replaced with the CRM employee ID; owner verification is required then.
  const account = sourceId(user.id),
    workspace = sourceId(user.workspace_id);
  return plaudHash(
    JSON.stringify(["plaud-source:v1", ISSUER, account, workspace])
  );
}
function safeDisplay(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /https?:\/\/|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/i.test(value)
  )
    throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
  return value;
}
export function plaudRecordingDto(value: unknown): PlaudRecording {
  const file = object(value),
    id = sourceId(file.id);
  const title = safeDisplay(file.name, 500);
  let callAt: number | null = null;
  if (
    file.start_at !== undefined &&
    file.start_at !== null &&
    file.start_at !== ""
  ) {
    if (
      typeof file.start_at !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
        file.start_at
      )
    )
      throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
    callAt = Date.parse(file.start_at);
    if (!Number.isSafeInteger(callAt))
      throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
  }
  let durationMs: number | null = null;
  if (file.duration !== undefined && file.duration !== null) {
    if (!Number.isSafeInteger(file.duration) || Number(file.duration) < 0)
      throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
    durationMs = Number(file.duration);
  }
  return { id, title, callAt, durationMs };
}
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}
export function renderPlaudSegments(segments: unknown[]): string {
  if (!segments.length) throw new PlaudError("PLAUD_TRANSCRIPT_UNAVAILABLE");
  return segments
    .map(segment => {
      const seg = object(segment);
      const body = seg.content ?? seg.topic;
      if (typeof body !== "string" || !body.length || body.includes("\u0000"))
        throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
      let time = "";
      if (seg.start_time !== undefined) {
        if (
          typeof seg.start_time !== "number" ||
          !Number.isFinite(seg.start_time) ||
          seg.start_time < 0
        )
          throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
        time = `[${formatTime(seg.start_time)}]`;
        if (seg.end_time !== undefined) {
          if (
            typeof seg.end_time !== "number" ||
            !Number.isFinite(seg.end_time) ||
            seg.end_time < seg.start_time
          )
            throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
          time = `[${formatTime(seg.start_time)} - ${formatTime(seg.end_time)}]`;
        }
      } else if (seg.end_time !== undefined)
        throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
      const speaker =
        seg.speaker == null || seg.speaker === ""
          ? ""
          : `${safeDisplay(seg.speaker, 250)}: `;
      return [time, `${speaker}${body}`].filter(Boolean).join(" ");
    })
    .join("\n");
}

interface ToolSession {
  call(name: ReadTool, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}
type SessionFactory = (accessToken: string) => Promise<ToolSession>;
async function openSdkSession(
  accessToken: string,
  fetchFn: typeof fetch
): Promise<ToolSession> {
  const client = new Client(
    { name: "elevay-plaud-readonly", version: "1.0.0" },
    { capabilities: {} }
  );
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    fetch: fetchFn,
    requestInit: {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "manual",
    },
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1000,
      maxReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
    },
  });
  // Intentionally no SDK authProvider: ordinary reads must never re-register an application
  // or silently start/upscope authorization. OAuth refresh is fenced separately below.
  client.onerror = () => {};
  try {
    await client.connect(transport, REQUEST_OPTIONS);
    const tools = new Map<string, Tool>();
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 10; page++) {
      const listed = await client.listTools(
        cursor ? { cursor } : {},
        REQUEST_OPTIONS
      );
      for (const tool of listed.tools) {
        if (tools.has(tool.name))
          throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
        tools.set(tool.name, tool);
      }
      if (!listed.nextCursor) {
        cursor = undefined;
        break;
      }
      if (seen.has(listed.nextCursor))
        throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
      seen.add(listed.nextCursor);
      cursor = listed.nextCursor;
    }
    if (cursor || READ_TOOLS.some(name => !tools.has(name)))
      throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
    const validator = new AjvJsonSchemaValidator();
    return {
      call: async (name, args) => {
        if (!(READ_TOOLS as readonly string[]).includes(name))
          throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
        const tool = tools.get(name)!;
        if (
          tool.annotations?.readOnlyHint === false ||
          tool.annotations?.destructiveHint === true ||
          !validator.getValidator(tool.inputSchema)(args).valid
        )
          throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
        return client.callTool(
          { name, arguments: args },
          undefined,
          REQUEST_OPTIONS
        );
      },
      close: () => client.close(),
    };
  } catch (error) {
    await client.close().catch(() => {});
    throw plaudSafeError(error);
  }
}
export type PlaudProviderOptions = {
  store?: PlaudConnectionStore;
  crypto?: PlaudConnectionCrypto;
  fetch?: typeof fetch;
  now?: () => number;
  /** Offline test seam; production always uses the official MCP client. */
  sessionFactory?: SessionFactory;
};
export class PlaudProvider {
  private readonly store: PlaudConnectionStore;
  private readonly crypto: PlaudConnectionCrypto;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly sessionFactory: SessionFactory;
  constructor(options: PlaudProviderOptions = {}) {
    this.store = options.store ?? new PlaudConnectionDb();
    this.crypto = options.crypto ?? new PlaudConnectionCrypto();
    this.fetchFn = createPlaudFetch(options.fetch);
    this.now = options.now ?? Date.now;
    this.sessionFactory =
      options.sessionFactory ?? (token => openSdkSession(token, this.fetchFn));
  }
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw plaudSafeError(error);
    }
  }
  private empty(userId: number) {
    return this.crypto.seal(userId, "credentials", { v: 1, connected: false });
  }
  private decode(userId: number, row: PlaudConnectionRow): Credential {
    const value = this.crypto.open<Credential>(
      userId,
      "credentials",
      row.sealedCredentials
    );
    if (!value || value.v !== 1 || typeof value.connected !== "boolean")
      throw new PlaudError("PLAUD_CREDENTIALS_UNAVAILABLE");
    if (value.connected) {
      if (
        !value.client ||
        value.client.issuer !== ISSUER ||
        !value.client.client_id ||
        !value.tokens ||
        value.tokens.issuer !== ISSUER ||
        !value.tokens.access_token ||
        value.tokens.token_type.toLowerCase() !== "bearer" ||
        !/^[a-f0-9]{64}$/.test(value.sourceScope ?? "")
      )
        throw new PlaudError("PLAUD_CREDENTIALS_UNAVAILABLE");
      if (
        value.expiresAt != null &&
        (!Number.isSafeInteger(value.expiresAt) || value.expiresAt < 0)
      )
        throw new PlaudError("PLAUD_CREDENTIALS_UNAVAILABLE");
    }
    return value;
  }
  private checkedTokens(tokens: OAuthTokens): OAuthTokens {
    const checked = OAuthTokensSchema.safeParse(tokens);
    if (
      !checked.success ||
      !checked.data.access_token ||
      checked.data.token_type.toLowerCase() !== "bearer" ||
      /[\r\n]/.test(checked.data.access_token) ||
      checked.data.access_token.length > 16_000 ||
      (checked.data.expires_in !== undefined &&
        (!Number.isFinite(checked.data.expires_in) ||
          checked.data.expires_in <= 0))
    )
      throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
    // Lower-level SDK helpers do not stamp issuer; the fixed verified issuer is mandatory.
    return { ...checked.data, issuer: ISSUER };
  }
  private expires(tokens: OAuthTokens): number | null {
    return tokens.expires_in === undefined
      ? null
      : this.now() + Math.floor(tokens.expires_in * 1000);
  }
  async status(userId: number): Promise<PlaudConnectionStatus> {
    return this.guarded(async () => {
      assertPlaudUser(userId);
      const row = await this.store.read(userId);
      if (!row) return { connected: false, needsReconnect: false };
      try {
        const credential = this.decode(userId, row);
        return {
          connected: credential.connected && !credential.needsReconnect,
          needsReconnect:
            !!credential.needsReconnect ||
            !!(
              credential.connected &&
              credential.expiresAt != null &&
              credential.expiresAt <= this.now() &&
              !credential.tokens?.refresh_token
            ),
        };
      } catch (error) {
        if (
          error instanceof PlaudError &&
          error.code === "PLAUD_CREDENTIALS_UNAVAILABLE"
        )
          return { connected: false, needsReconnect: true };
        throw error;
      }
    });
  }
  async start(
    userId: number,
    sessionHash: string,
    returnPath: string
  ): Promise<{ authorizationUrl: string }> {
    return this.guarded(async () => {
      assertPlaudUser(userId);
      validateSession(sessionHash);
      validatePlaudReturnPath(returnPath);
      const version = await this.store.beginAuthorization(
        userId,
        this.empty(userId),
        this.now()
      );
      // Only this explicit employee-connect method can dynamically register a client.
      const resource = await discoverOAuthProtectedResourceMetadata(
        MCP_URL,
        { resourceMetadataUrl: RESOURCE_METADATA },
        this.fetchFn
      );
      const metadata = await discoverAuthorizationServerMetadata(ISSUER, {
        fetchFn: this.fetchFn,
      });
      if (
        resource.resource !== MCP_URL ||
        resource.authorization_servers?.length !== 1 ||
        resource.authorization_servers[0] !== ISSUER ||
        !metadata ||
        metadata.issuer !== ISSUER ||
        metadata.authorization_endpoint !== METADATA.authorization_endpoint ||
        metadata.token_endpoint !== METADATA.token_endpoint ||
        metadata.registration_endpoint !== METADATA.registration_endpoint ||
        !metadata.code_challenge_methods_supported?.includes("S256") ||
        !metadata.token_endpoint_auth_methods_supported?.includes("none")
      )
        throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
      const registration = await registerClient(ISSUER, {
        metadata: METADATA,
        clientMetadata: CLIENT_METADATA,
        fetchFn: this.fetchFn,
      });
      const parsed = OAuthClientInformationFullSchema.safeParse(registration);
      if (
        !parsed.success ||
        parsed.data.token_endpoint_auth_method !== "none" ||
        parsed.data.client_secret ||
        parsed.data.redirect_uris.length !== 1 ||
        parsed.data.redirect_uris[0] !== PLAUD_CALLBACK_URL
      )
        throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
      const client = { ...parsed.data, issuer: ISSUER };
      const state = randomBytes(32).toString("base64url"),
        stateHash = plaudHash(state);
      const authorization = await startAuthorization(ISSUER, {
        metadata: METADATA,
        clientInformation: client,
        redirectUrl: PLAUD_CALLBACK_URL,
        state,
        resource: MCP_URL,
      });
      const url = authorization.authorizationUrl;
      if (
        url.origin + url.pathname !== METADATA.authorization_endpoint ||
        url.searchParams.get("state") !== state ||
        url.searchParams.get("code_challenge_method") !== "S256" ||
        url.searchParams.get("redirect_uri") !== PLAUD_CALLBACK_URL
      )
        throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
      const sealedState = this.crypto.seal(
        userId,
        "oauth-state",
        {
          v: 1,
          version,
          verifier: authorization.codeVerifier,
          returnPath,
          client,
        } satisfies Pending,
        `${sessionHash}:${stateHash}`
      );
      const now = this.now();
      if (
        !(await this.store.saveState(
          {
            stateHash,
            userId,
            sessionHash,
            sealedState,
            createdAt: now,
            expiresAt: now + STATE_TTL,
            consumedAt: null,
          },
          version
        ))
      )
        throw new PlaudError("PLAUD_CONNECTION_CHANGED");
      return { authorizationUrl: url.href };
    });
  }
  async finish(
    userId: number,
    sessionHash: string,
    state: string,
    code: string
  ): Promise<{ returnPath: string }> {
    return this.guarded(async () => {
      assertPlaudUser(userId);
      validateSession(sessionHash);
      if (
        typeof state !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(state) ||
        typeof code !== "string" ||
        !code.length ||
        code.length > 4096 ||
        /[\x00-\x20\x7f]/.test(code)
      )
        throw new PlaudError("PLAUD_OAUTH_STATE_INVALID");
      const stateHash = plaudHash(state);
      const row = await this.store.consumeState(
        userId,
        sessionHash,
        stateHash,
        this.now()
      );
      if (!row) throw new PlaudError("PLAUD_OAUTH_STATE_INVALID");
      const pending = this.crypto.open<Pending>(
        userId,
        "oauth-state",
        row.sealedState,
        `${sessionHash}:${stateHash}`
      );
      if (
        pending.v !== 1 ||
        !Number.isSafeInteger(pending.version) ||
        pending.client?.issuer !== ISSUER ||
        typeof pending.verifier !== "string" ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(pending.verifier)
      )
        throw new PlaudError("PLAUD_OAUTH_STATE_INVALID");
      validatePlaudReturnPath(pending.returnPath);
      if ((await this.store.read(userId))?.version !== pending.version)
        throw new PlaudError("PLAUD_CONNECTION_CHANGED");
      const tokens = this.checkedTokens(
        await exchangeAuthorization(ISSUER, {
          metadata: METADATA,
          clientInformation: pending.client,
          authorizationCode: code,
          codeVerifier: pending.verifier,
          redirectUri: PLAUD_CALLBACK_URL,
          resource: MCP_URL,
          fetchFn: this.fetchFn,
        })
      );
      const session = await this.sessionFactory(tokens.access_token);
      let scope: string;
      try {
        scope = plaudSourceScope(
          parseJson(
            unwrapPlaudToolText(
              await session.call("get_current_user", {}),
              false
            )
          )
        );
      } finally {
        await session.close().catch(() => {});
      }
      const credential: Credential = {
        v: 1,
        connected: true,
        client: pending.client,
        tokens,
        expiresAt: this.expires(tokens),
        sourceScope: scope,
      };
      if (
        !(await this.store.replace(
          userId,
          pending.version,
          this.crypto.seal(userId, "credentials", credential),
          this.now()
        ))
      )
        throw new PlaudError("PLAUD_CONNECTION_CHANGED");
      return { returnPath: pending.returnPath };
    });
  }
  async disconnect(userId: number): Promise<void> {
    return this.guarded(async () => {
      assertPlaudUser(userId);
      await this.store.disconnect(userId, this.empty(userId), this.now());
    });
  }
  private async connection(
    userId: number
  ): Promise<{ row: PlaudConnectionRow; credential: Credential }> {
    const row = await this.store.read(userId);
    if (!row) throw new PlaudError("PLAUD_NOT_CONNECTED");
    const credential = this.decode(userId, row);
    if (credential.needsReconnect)
      throw new PlaudError("PLAUD_RECONNECT_REQUIRED");
    if (!credential.connected) throw new PlaudError("PLAUD_NOT_CONNECTED");
    return { row, credential };
  }
  private async refresh(
    userId: number,
    row: PlaudConnectionRow,
    credential: Credential
  ): Promise<void> {
    if (!credential.tokens?.refresh_token || !credential.client)
      throw new PlaudError("PLAUD_RECONNECT_REQUIRED");
    const lease = randomBytes(32).toString("hex"),
      now = this.now();
    if (
      !(await this.store.acquireLease(
        userId,
        row.version,
        lease,
        now,
        now + LEASE_TTL
      ))
    )
      throw new PlaudError("PLAUD_CONNECTION_BUSY");
    let succeeded = false;
    try {
      let refreshed: OAuthTokens;
      try {
        refreshed = this.checkedTokens(
          await refreshAuthorization(ISSUER, {
            metadata: METADATA,
            clientInformation: credential.client,
            refreshToken: credential.tokens.refresh_token,
            resource: MCP_URL,
            fetchFn: this.fetchFn,
          })
        );
      } catch {
        // The request may have rotated a token before a transport failure. Never retry the
        // old token concurrently or erase a newer/disconnected connection.
        const failed = { ...credential, needsReconnect: true };
        await this.store.saveLease(
          userId,
          row.version,
          lease,
          this.crypto.seal(userId, "credentials", failed),
          this.now()
        );
        throw new PlaudError("PLAUD_RECONNECT_REQUIRED");
      }
      // The SDK preserves an omitted refresh_token; keep that invariant explicit here too.
      const next: Credential = {
        ...credential,
        tokens: {
          ...refreshed,
          refresh_token:
            refreshed.refresh_token ?? credential.tokens.refresh_token,
        },
        expiresAt: this.expires(refreshed),
        needsReconnect: false,
      };
      succeeded = await this.store.saveLease(
        userId,
        row.version,
        lease,
        this.crypto.seal(userId, "credentials", next),
        this.now()
      );
      if (!succeeded) throw new PlaudError("PLAUD_CONNECTION_CHANGED");
    } finally {
      if (!succeeded)
        await this.store
          .releaseLease(userId, row.version, lease)
          .catch(() => {});
    }
  }
  private async withSession<T>(
    userId: number,
    work: (session: ToolSession, sourceScope: string) => Promise<T>
  ): Promise<T> {
    assertPlaudUser(userId);
    let current = await this.connection(userId);
    if (
      current.credential.expiresAt != null &&
      current.credential.expiresAt <= this.now() + 30_000
    ) {
      await this.refresh(userId, current.row, current.credential);
      current = await this.connection(userId);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      let session: ToolSession | undefined;
      try {
        session = await this.sessionFactory(
          current.credential.tokens!.access_token
        );
        const scope = plaudSourceScope(
          parseJson(
            unwrapPlaudToolText(
              await session.call("get_current_user", {}),
              false
            )
          )
        );
        if (scope !== current.credential.sourceScope)
          throw new PlaudError("PLAUD_RECONNECT_REQUIRED");
        const value = await work(session, scope);
        if ((await this.store.read(userId))?.version !== current.row.version)
          throw new PlaudError("PLAUD_CONNECTION_CHANGED");
        return value;
      } catch (error) {
        if (
          !(error instanceof PlaudError) ||
          error.code !== "PLAUD_RECONNECT_REQUIRED" ||
          attempt !== 0
        )
          throw error;
        await this.refresh(userId, current.row, current.credential);
        current = await this.connection(userId);
      } finally {
        await session?.close().catch(() => {});
      }
    }
    throw new PlaudError("PLAUD_RECONNECT_REQUIRED");
  }
  async listRecordings(
    userId: number,
    page: number
  ): Promise<PlaudRecordingPage> {
    return this.guarded(async () => {
      if (!Number.isSafeInteger(page) || page < 1 || page > 100_000)
        throw new PlaudError("PLAUD_INVALID_INPUT");
      return this.withSession(userId, async session => {
        const data = object(
          parseJson(
            unwrapPlaudToolText(
              await session.call("list_files", { page, page_size: 20 }),
              true
            )
          )
        );
        if (
          !Array.isArray(data.data) ||
          data.data.length > 20 ||
          (data.page !== undefined && data.page !== page)
        )
          throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
        const items = data.data.map(plaudRecordingDto);
        if (new Set(items.map(item => item.id)).size !== items.length)
          throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
        // No guessed total/has_more fields: one bounded next-page probe establishes hasMore.
        let hasMore = false;
        if (items.length === 20) {
          const next = object(
            parseJson(
              unwrapPlaudToolText(
                await session.call("list_files", {
                  page: page + 1,
                  page_size: 20,
                }),
                true
              )
            )
          );
          if (
            !Array.isArray(next.data) ||
            next.data.length > 20 ||
            (next.page !== undefined && next.page !== page + 1)
          )
            throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
          const nextItems = next.data.map(plaudRecordingDto);
          if (
            nextItems.some(item =>
              items.some(existing => existing.id === item.id)
            )
          )
            throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
          hasMore = nextItems.length > 0;
        }
        return { items, page, hasMore };
      });
    });
  }
  async readRecording(
    userId: number,
    id: string
  ): Promise<PlaudFetchedRecording> {
    return this.guarded(async () => {
      try {
        sourceId(id);
      } catch {
        throw new PlaudError("PLAUD_INVALID_INPUT");
      }
      return this.withSession(userId, async (session, sourceScope) => {
        const rawFile = object(
          parseJson(
            unwrapPlaudToolText(
              await session.call("get_file", { file_id: id }),
              true
            )
          )
        );
        const recording = plaudRecordingDto(rawFile);
        if (recording.id !== id)
          throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
        // A raw source entry proves that an unpaginated text response is a transaction,
        // not the human-readable missing-block/empty-block status returned by the tool.
        if (
          !Array.isArray(rawFile.source_list) ||
          !rawFile.source_list.some(
            source =>
              source &&
              typeof source === "object" &&
              (source as JsonObject).data_type === "transaction"
          )
        )
          throw new PlaudError("PLAUD_TRANSCRIPT_UNAVAILABLE");
        let cursor: string | undefined,
          offset = 0,
          expectedTotal: number | undefined,
          bytes = 0;
        const seen = new Set<string>(),
          parts: string[] = [];
        for (let page = 0; page < 100; page++) {
          const args: Record<string, unknown> = {
            file_id: id,
            block: "transaction",
            limit: 500,
          };
          if (cursor) args.cursor = cursor;
          const payload = unwrapPlaudToolText(
            await session.call("get_transcript", args),
            true
          );
          bytes += Buffer.byteLength(payload);
          if (bytes > MAX_TRANSCRIPT_BYTES)
            throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
          let parsed: unknown;
          try {
            parsed = JSON.parse(payload);
          } catch {
            // Non-JSON content is also an official unpaginated source response.
          }
          if (Array.isArray(parsed))
            throw new PlaudError(
              parsed.length === 0
                ? "PLAUD_TRANSCRIPT_UNAVAILABLE"
                : "PLAUD_RESPONSE_UNSUPPORTED"
            );
          // Official @plaud-ai/mcp dist/chunk-W365TEP4.js:345-359 returns every
          // non-array source body verbatim, including JSON scalars and objects.
          // Reserve every envelope field so partial/invalid pages cannot fall back to raw.
          const pagination =
            parsed !== null &&
            typeof parsed === "object" &&
            [
              "file_id",
              "block",
              "total",
              "offset",
              "limit",
              "returned",
              "next_cursor",
              "segments",
              "marks",
            ].some(key => Object.prototype.hasOwnProperty.call(parsed, key));
          if (!pagination) {
            if (page !== 0 || !payload.length || payload.includes("\u0000"))
              throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
            // Keep the original wrapped payload, not a parsed/re-serialized JSON value.
            return {
              ...recording,
              sourceScope,
              transcript: payload.replace(/\r\n?/g, "\n"),
            };
          }
          const data = object(parsed);
          if (
            data.file_id !== id ||
            data.block !== "transaction" ||
            !Number.isSafeInteger(data.total) ||
            Number(data.total) < 1 ||
            Number(data.total) > 50_000 ||
            data.offset !== offset ||
            data.limit !== 500 ||
            !Array.isArray(data.segments) ||
            data.returned !== data.segments.length ||
            data.segments.length < 1 ||
            data.segments.length > 500
          )
            throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
          if (expectedTotal === undefined) expectedTotal = Number(data.total);
          if (
            data.total !== expectedTotal ||
            offset + data.segments.length > expectedTotal
          )
            throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
          parts.push(renderPlaudSegments(data.segments));
          offset += data.segments.length;
          if (data.next_cursor === null) {
            if (offset !== expectedTotal)
              throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
            const transcript = parts.join("\n").replace(/\r\n?/g, "\n");
            if (
              !transcript.length ||
              Buffer.byteLength(transcript) > MAX_TRANSCRIPT_BYTES
            )
              throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
            return { ...recording, sourceScope, transcript };
          }
          if (
            typeof data.next_cursor !== "string" ||
            !data.next_cursor.length ||
            data.next_cursor.length > 2048 ||
            seen.has(data.next_cursor) ||
            offset >= expectedTotal
          )
            throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
          seen.add(data.next_cursor);
          cursor = data.next_cursor;
        }
        throw new PlaudError("PLAUD_RESPONSE_UNSUPPORTED");
      });
    });
  }
}
