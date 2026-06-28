import { describe, it, expect, afterEach } from "vitest";
import { createDispatcher } from "../src/bridge/dispatcher";
import { startBridgeServer, type BridgeServer } from "../src/bridge/server";
import type { EditorAdapter, ActiveEditorResult, SelectionResult } from "../src/adapter/adapter.types";
import { generateToken, Methods, type JsonRpcResponse } from "@vchb/protocol";

const activeEditor: ActiveEditorResult = {
  uri: "file:///repo/src/foo.ts",
  fileName: "/repo/src/foo.ts",
  languageId: "typescript",
  isDirty: false,
};

const selection: SelectionResult = {
  uri: "file:///repo/src/foo.ts",
  fileName: "/repo/src/foo.ts",
  languageId: "typescript",
  range: { start: { line: 1, character: 0 }, end: { line: 2, character: 3 } },
  text: "hi",
};

function fakeAdapter(): EditorAdapter {
  return {
    async getActiveEditor() {
      return activeEditor;
    },
    async getSelection() {
      return selection;
    },
  };
}

async function start(token: string): Promise<BridgeServer> {
  return startBridgeServer({
    bindAddress: "127.0.0.1",
    port: 0,
    token,
    workspaceRoot: "/repo",
    version: "test",
    dispatcher: createDispatcher({
      adapter: fakeAdapter(),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    }),
  });
}

describe("bridge server", () => {
  let server: BridgeServer | undefined;
  afterEach(async () => {
    if (server) await server.close();
    server = undefined;
  });

  it("responds to /health without auth", async () => {
    server = await start(generateToken());
    const resp = await fetch(`${server.url}/health`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    expect(body.version).toBe("test");
  });

  it("rejects /rpc without a bearer token", async () => {
    const token = generateToken();
    server = await start(token);
    const resp = await fetch(`${server.url}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: Methods.EditorGetActiveEditor, params: {} }),
    });
    expect(resp.status).toBe(401);
  });

  it("rejects a wrong bearer token", async () => {
    const token = generateToken();
    server = await start(token);
    const resp = await fetch(`${server.url}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer wrong" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: Methods.EditorGetActiveEditor, params: {} }),
    });
    expect(resp.status).toBe(401);
  });

  it("serves an authenticated JSON-RPC round trip", async () => {
    const token = generateToken();
    server = await start(token);
    const resp = await fetch(`${server.url}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: Methods.EditorGetActiveEditor, params: {} }),
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as JsonRpcResponse<ActiveEditorResult>;
    expect(body.id).toBe(1);
    expect(body.error).toBeUndefined();
    expect(body.result?.fileName).toBe("/repo/src/foo.ts");
  });

  it("returns METHOD_NOT_FOUND for unknown methods", async () => {
    const token = generateToken();
    server = await start(token);
    const resp = await fetch(`${server.url}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "nope/x", params: {} }),
    });
    const body = (await resp.json()) as JsonRpcResponse;
    expect(body.error?.code).toBe(-32601);
  });

  it("returns NO_ACTIVE_EDITOR when adapter yields null", async () => {
    const token = generateToken();
    server = await startBridgeServer({
      bindAddress: "127.0.0.1",
      port: 0,
      token,
      workspaceRoot: "/repo",
      version: "test",
      dispatcher: createDispatcher({
        adapter: {
          async getActiveEditor() {
            return null;
          },
          async getSelection() {
            return null;
          },
        },
        workspaceRoot: "/repo",
        allowOutsideRoot: false,
      }),
    });
    const resp = await fetch(`${server.url}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: Methods.EditorGetActiveEditor, params: {} }),
    });
    const body = (await resp.json()) as JsonRpcResponse;
    expect(body.error?.code).toBe(-32003);
  });
});
