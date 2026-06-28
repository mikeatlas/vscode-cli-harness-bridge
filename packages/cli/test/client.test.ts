import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import { BridgeClient, BridgeClientError, exitCodeForError } from "../src/client";
import { Methods } from "@vchb/protocol";

function startMockBridge(handler: (body: unknown) => unknown, token: string): Promise<{ url: string; close: () => Promise<void> }> {
  const { promise, resolve, reject } = Promise.withResolvers<{ url: string; close: () => Promise<void> }>();
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "POST" && req.url === "/rpc") {
      const auth = req.headers["authorization"];
      if (auth !== `Bearer ${token}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized" } }));
        return;
      }
      let raw = "";
      req.on("data", (c: Buffer) => (raw += c.toString()));
      req.on("end", () => {
        const out = handler(JSON.parse(raw));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(out));
      });
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1", () => {
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      reject(new Error("failed"));
      return;
    }
    resolve({
      url: `http://127.0.0.1:${addr.port}`,
      close: () => {
        const { promise, resolve } = Promise.withResolvers<void>();
        server.close(() => resolve());
        return promise;
      },
    });
  });
  return promise;
}

describe("BridgeClient", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  it("performs an authenticated JSON-RPC call and returns the result", async () => {
    const mock = await startMockBridge(
      (b) => ({ jsonrpc: "2.0", id: (b as { id: number }).id, result: { fileName: "/x.ts" } }),
      "secret",
    );
    close = mock.close;
    const client = new BridgeClient({ url: mock.url, token: "secret" });
    const result = await client.call<{ fileName: string }>(Methods.EditorGetActiveEditor);
    expect(result.fileName).toBe("/x.ts");
  });

  it("throws AUTH_REQUIRED on 401", async () => {
    const mock = await startMockBridge(() => ({}), "secret");
    close = mock.close;
    const client = new BridgeClient({ url: mock.url, token: "wrong" });
    await expect(client.call(Methods.EditorGetActiveEditor)).rejects.toBeInstanceOf(BridgeClientError);
    try {
      await client.call(Methods.EditorGetActiveEditor);
    } catch (e) {
      if (!(e instanceof BridgeClientError)) throw e;
      expect(e.codeName).toBe("AUTH_REQUIRED");
      expect(exitCodeForError(e)).toBe(3);
    }
  });

  it("surfaces a JSON-RPC error from the bridge", async () => {
    const mock = await startMockBridge(
      (b) => ({ jsonrpc: "2.0", id: (b as { id: number }).id, error: { code: -32003, message: "no editor" } }),
      "secret",
    );
    close = mock.close;
    const client = new BridgeClient({ url: mock.url, token: "secret" });
    try {
      await client.call(Methods.EditorGetActiveEditor);
      throw new Error("expected throw");
    } catch (e) {
      if (!(e instanceof BridgeClientError)) throw e;
      expect(e.codeName).toBe("NO_ACTIVE_EDITOR");
      expect(exitCodeForError(e)).toBe(2);
    }
  });
});
