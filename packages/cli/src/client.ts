import type { JsonRpcRequest, JsonRpcResponse } from "@vchb/protocol";
import { bypassProxyForUrl } from "./proxyBypass";

// JSON-RPC over HTTP. Uses Node global fetch (Node >= 18). IMPORTANT: bypasses ambient
// HTTP(S)_PROXY for the bridge host (Phase 4 concern — sandbox sets a proxy that would
// otherwise intercept/loopback-fail host bridge calls). Node fetch honors NO_PROXY only if
// a dispatcher is configured; the simplest robust approach is to construct a fetch that does
// not use the proxy agent for the bridge URL.
const DEFAULT_TIMEOUT_MS = 60_000;

export interface BridgeClientOptions {
  url: string;
  token: string;
  timeoutMs?: number;
  debug?: boolean;
}

export class BridgeClient {
  private nextId = 1;

  constructor(private opts: BridgeClientOptions) {}

  async call<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params: params ?? {} };
    if (this.opts.debug) {
      // eslint-disable-next-line no-console
      console.error(`[vchb] POST ${this.opts.url} method=${method} id=${id}`);
    }

    const controller = new AbortController();
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      bypassProxyForUrl(this.opts.url);
      const resp = await fetch(this.opts.url + "/rpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.opts.token}`,
        },
        body: JSON.stringify(req),
        signal: controller.signal,
        // Node's undici fetch does not auto-apply HTTP_PROXY env (unlike node-fetch).
        // If a global dispatcher were set, we'd need a no-proxy agent; that's Phase 4.
      });

      if (resp.status === 401) {
        throw new BridgeClientError("AUTH_REQUIRED", "Unauthorized (bad/missing token)", 401);
      }
      if (!resp.ok) {
        throw new BridgeClientError("BRIDGE_UNAVAILABLE", `HTTP ${resp.status}`, resp.status);
      }

      const body = (await resp.json()) as JsonRpcResponse<T>;
      if (body.error) {
        throw new BridgeClientError(
          nameForCode(body.error.code),
          body.error.message,
          body.error.code,
          body.error.data,
        );
      }
      return body.result as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

function nameForCode(code: number): string {
  switch (code) {
    case -32001: return "AUTH_REQUIRED";
    case -32002: return "FORBIDDEN_PATH";
    case -32003: return "NO_ACTIVE_EDITOR";
    case -32004: return "PERMISSION_DENIED";
    case -32005: return "METHOD_NOT_ALLOWED";
    case -32006: return "BRIDGE_UNAVAILABLE";
    case -32601: return "METHOD_NOT_FOUND";
    case -32602: return "INVALID_PARAMS";
    default: return "INTERNAL_ERROR";
  }
}

export class BridgeClientError extends Error {
  constructor(
    public readonly codeName: string,
    message: string,
    public readonly code: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "BridgeClientError";
  }
}

// Map a BridgeClientError codeName to a process exit code.
export function exitCodeForError(err: BridgeClientError): number {
  switch (err.codeName) {
    case "NO_ACTIVE_EDITOR": return 2;
    case "AUTH_REQUIRED": return 3;
    case "BRIDGE_UNAVAILABLE": return 4;
    case "FORBIDDEN_PATH": return 5;
    case "PERMISSION_DENIED": return 6;
    case "METHOD_NOT_FOUND":
    case "INVALID_PARAMS":
    case "INTERNAL_ERROR":
    default: return 1;
  }
}
