// The transport for sync: fetch with a timeout, and failures sorted into the
// three kinds the user can act on (SYNC.md, "One sync cycle").

export const DATABASE_URL = "https://cynote-f5f04-default-rtdb.firebaseio.com";
export const REQUEST_TIMEOUT_MS = 8000;

export type SyncErrorKind = "offline" | "denied" | "error";

export class SyncError extends Error {
  readonly kind: SyncErrorKind;
  constructor(kind: SyncErrorKind, message: string) {
    super(message);
    this.name = "SyncError";
    this.kind = kind;
  }
}

/** What the engine needs from the network: paths like `/sync/CODE/v2/stamp.json`
 * (a query string in the path is fine) and plain JSON values back. */
export type SyncHttp = {
  getJson(path: string): Promise<unknown>;
  patchJson(path: string, body: unknown): Promise<unknown>;
};

export type HttpOptions = {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/** `extraQuery` (like `ns=cynote-f5f04-default-rtdb` for the emulator; any other namespace there has no rules) is added to every URL. */
export function createHttp(baseUrl: string, extraQuery = "", options: HttpOptions = {}): SyncHttp {
  const base = baseUrl.replace(/\/+$/, "");
  const extra = extraQuery.replace(/^[?&]+/, "");
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  const urlFor = (path: string) => {
    if (!extra) return base + path;
    return base + path + (path.includes("?") ? "&" : "?") + extra;
  };

  async function request(method: "GET" | "PATCH", path: string, body?: unknown): Promise<unknown> {
    const doFetch = options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let text: string;
    let status: number;
    try {
      const res = await doFetch(urlFor(path), {
        method,
        signal: controller.signal,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      status = res.status;
      text = await res.text();
    } catch (e) {
      // No connection, DNS failure, timeout (abort): all "offline".
      if (e instanceof TypeError || (e instanceof Error && e.name === "AbortError")) {
        throw new SyncError("offline", "sem conexão");
      }
      throw new SyncError("error", e instanceof Error ? e.message : "falha de rede");
    } finally {
      clearTimeout(timer);
    }

    if (status === 401 || status === 403) throw new SyncError("denied", "HTTP " + status);
    if (status < 200 || status >= 300) throw new SyncError("error", "HTTP " + status);
    if (text.trim() === "") return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new SyncError("error", "resposta inválida do servidor");
    }
  }

  return {
    getJson: (path) => request("GET", path),
    patchJson: (path, body) => request("PATCH", path, body),
  };
}
