import { describe, it, expect } from "vitest";
import { createDispatcher } from "../src/bridge/dispatcher";
import type { EditorAdapter, ActiveEditorResult, SelectionResult } from "../src/adapter/adapter.types";
import { Methods } from "@vchb/protocol";

function makeAdapter(opts: {
  active?: ActiveEditorResult | null;
  selection?: SelectionResult | null;
  showDiffResult?: { opened: boolean };
  problemsResult?: { diagnostics: Array<{ severity: string; message: string; source?: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }> };
  permissionOutcome?: "allow_once" | "allow_always" | "deny";
}): EditorAdapter {
  return {
    async getActiveEditor() {
      return opts.active === undefined ? null : opts.active;
    },
    async getSelection() {
      return opts.selection === undefined ? null : opts.selection;
    },
    async showDiff() {
      return opts.showDiffResult ?? { opened: true };
    },
    async getProblems() {
      return opts.problemsResult ?? { diagnostics: [] };
    },
    async requestPermission() {
      return opts.permissionOutcome ?? "allow_once";
    },
    async readFile() {
      return { content: "file content" };
    },
    async applyEdit() {
      return { applied: true };
    },
    async saveDocument() {
      return { saved: true };
    },
    async terminalCreate() {
      return { terminalId: 1, name: "VCHB Terminal" };
    },
    async terminalSendText() {
      return { sent: true };
    },
  };
}

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
  range: { start: { line: 10, character: 0 }, end: { line: 12, character: 5 } },
  text: "selected",
};

describe("dispatcher", () => {
  it("returns active editor from the adapter", async () => {
    const d = createDispatcher({
      adapter: makeAdapter({ active: activeEditor }),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    });
    const res = await d.handle({ jsonrpc: "2.0", id: 1, method: Methods.EditorGetActiveEditor, params: {} });
    expect(res.error).toBeUndefined();
    expect(res.result).toEqual(activeEditor);
  });

  it("returns selection from the adapter", async () => {
    const d = createDispatcher({
      adapter: makeAdapter({ selection }),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    });
    const res = await d.handle({ jsonrpc: "2.0", id: 2, method: Methods.EditorGetSelection, params: {} });
    expect(res.error).toBeUndefined();
    expect(res.result).toEqual(selection);
  });

  it("returns NO_ACTIVE_EDITOR when adapter yields null", async () => {
    const d = createDispatcher({
      adapter: makeAdapter({ active: null }),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    });
    const res = await d.handle({ jsonrpc: "2.0", id: 3, method: Methods.EditorGetActiveEditor, params: {} });
    expect(res.error?.code).toBe(-32003);
  });

  it("returns METHOD_NOT_FOUND for unknown methods", async () => {
    const d = createDispatcher({
      adapter: makeAdapter({}),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    });
    const res = await d.handle({ jsonrpc: "2.0", id: 4, method: "nope/nothing", params: {} });
    expect(res.error?.code).toBe(-32601);
  });

  it("returns INVALID_REQUEST for a malformed request", async () => {
    const d = createDispatcher({
      adapter: makeAdapter({}),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    });
    const res = await d.handle({ jsonrpc: "2.0", id: 5 } as never);
    expect(res.error?.code).toBe(-32600);
  });

  it("registers a custom handler via registerHandler", async () => {
    const d = createDispatcher({
      adapter: makeAdapter({}),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    });
    d.registerHandler("custom/ping", async () => "pong");
    const res = await d.handle({ jsonrpc: "2.0", id: 6, method: "custom/ping", params: {} });
    expect(res.result).toBe("pong");
  });
  it("dispatches ui/showDiff to the adapter", async () => {
    const d = createDispatcher({
      adapter: makeAdapter({ showDiffResult: { opened: true } }),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    });
    const res = await d.handle({
      jsonrpc: "2.0",
      id: 7,
      method: Methods.UiShowDiff,
      params: { originalPath: "/repo/a.ts", proposedPath: "/repo/b.ts" },
    });
    expect(res.error).toBeUndefined();
    expect(res.result).toEqual({ opened: true });
  });

  it("rejects ui/showDiff with missing params", async () => {
    const d = createDispatcher({
      adapter: makeAdapter({}),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    });
    const res = await d.handle({
      jsonrpc: "2.0",
      id: 8,
      method: Methods.UiShowDiff,
      params: {},
    });
    expect(res.error?.code).toBe(-32602); // INVALID_PARAMS
  });

  it("dispatches diagnostics/getProblems to the adapter", async () => {
    const diags = [
      {
        severity: "error",
        message: "Cannot find name 'foo'.",
        source: "typescript",
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } },
      },
    ];
    const d = createDispatcher({
      adapter: makeAdapter({ problemsResult: { diagnostics: diags } }),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    });
    const res = await d.handle({
      jsonrpc: "2.0",
      id: 9,
      method: Methods.DiagnosticsGetProblems,
      params: {},
    });
    expect(res.error).toBeUndefined();
    expect(res.result).toEqual({ diagnostics: diags });
  });

  it("dispatches diagnostics/getProblems with workspace flag", async () => {
    const d = createDispatcher({
      adapter: makeAdapter({ problemsResult: { diagnostics: [] } }),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    });
    const res = await d.handle({
      jsonrpc: "2.0",
      id: 10,
      method: Methods.DiagnosticsGetProblems,
      params: { workspace: true },
    });
    expect(res.error).toBeUndefined();
  });
  it("dispatches permission/request and returns allow_once", async () => {
    const d = createDispatcher({
      adapter: makeAdapter({ permissionOutcome: "allow_once" }),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    });
    const res = await d.handle({
      jsonrpc: "2.0",
      id: 11,
      method: Methods.PermissionRequest,
      params: { method: "workspace/applyEdit", description: "Apply edit to foo.ts" },
    });
    expect(res.error).toBeUndefined();
    expect(res.result).toEqual({ outcome: "allow_once" });
  });

  it("returns PERMISSION_DENIED when adapter denies", async () => {
    const d = createDispatcher({
      adapter: makeAdapter({ permissionOutcome: "deny" }),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    });
    const res = await d.handle({
      jsonrpc: "2.0",
      id: 12,
      method: Methods.PermissionRequest,
      params: { method: "workspace/applyEdit" },
    });
    expect(res.error?.code).toBe(-32004);
  });

  it("returns allow_always when adapter allows always", async () => {
    const d = createDispatcher({
      adapter: makeAdapter({ permissionOutcome: "allow_always" }),
      workspaceRoot: "/repo",
      allowOutsideRoot: false,
    });
    const res = await d.handle({
      jsonrpc: "2.0",
      id: 13,
      method: Methods.PermissionRequest,
      params: { method: "terminal/sendText" },
    });
    expect(res.result).toEqual({ outcome: "allow_always" });
  });
});
