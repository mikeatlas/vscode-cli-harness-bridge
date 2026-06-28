import http from "node:http";
import type { Dispatcher } from "./dispatcher";
import { isAuthorized } from "./auth";
import { type JsonRpcRequest, type JsonRpcResponse, type Session } from "@vchb/protocol";

export interface BridgeServerOptions {
  bindAddress: string;
  port: number; // 0 = random free port
  token: string;
  workspaceRoot: string;
  workspaces?: string[];
  version: string;
  dispatcher: Dispatcher;
}

export interface BridgeServer {
  readonly port: number;
  readonly url: string;
  readonly dockerUrl: string;
  close(): Promise<void>;
  readonly session: Session;
}

export function startBridgeServer(opts: BridgeServerOptions): Promise<BridgeServer> {
  const { promise, resolve, reject } = Promise.withResolvers<BridgeServer>();

  const server = http.createServer(async (req, res) => {
    res.setHeader("Connection", "close");

    if (req.method === "GET" && req.url === "/health") {
      // No token, no workspace leak.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, version: opts.version }));
      return;
    }

    if (req.method === "POST" && req.url === "/rpc") {
      // Auth gate.
      if (!isAuthorized(req.headers["authorization"], opts.token)) {
        const body: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32001, message: "Bearer token required or invalid" },
        };
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
        return;
      }

      let raw = "";
      req.on("data", (chunk: Buffer) => {
        raw += chunk.toString();
        if (raw.length > 1_000_000) {
          res.writeHead(413);
          res.end();
          req.destroy();
        }
      });
      req.on("end", async () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          const err: JsonRpcResponse = {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          };
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(err));
          return;
        }

        // Batch not supported in POC; single request only.
        if (Array.isArray(parsed)) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32600, message: "Batch requests not supported" },
          }));
          return;
        }

        const rpcReq = parsed as JsonRpcRequest;
        const rpcRes = await opts.dispatcher.handle(rpcReq);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(rpcRes));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.on("error", reject);
  server.listen(opts.port, opts.bindAddress, () => {
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      reject(new Error("Failed to bind bridge server"));
      return;
    }
    const actualPort = addr.port;
    const host = opts.bindAddress === "127.0.0.1" ? "127.0.0.1" : opts.bindAddress;
    const url = `http://${host}:${actualPort}`;
    // dockerBridge is best-effort; host.docker.internal is the common macOS default.
    // Phase 4 empirically validates/overrides this.
    const dockerUrl = `http://host.docker.internal:${actualPort}`;
    const session: Session = {
      bridge: url,
      dockerBridge: dockerUrl,
      token: opts.token,
      workspace: opts.workspaceRoot,
      workspaces: opts.workspaces ?? [opts.workspaceRoot],
      pid: process.pid,
      createdAt: new Date().toISOString(),
      version: opts.version,
    };
    resolve({
      port: actualPort,
      url,
      dockerUrl,
      session,
      async close() {
        const { promise: closePromise, resolve: closeResolve, reject: closeReject } =
          Promise.withResolvers<void>();
        server.close((err) => (err ? closeReject(err) : closeResolve()));
        await closePromise;
      },
    });
  });

  return promise;
}
