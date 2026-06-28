import { describe, it, expect } from "vitest";
import { READ_ONLY_METHODS, Methods } from "@vchb/protocol";

describe("protocol/methods", () => {
  it("allowlists the read-only methods", () => {
    expect(READ_ONLY_METHODS[Methods.EditorGetActiveEditor]).toBe(true);
    expect(READ_ONLY_METHODS[Methods.EditorGetSelection]).toBe(true);
    expect(READ_ONLY_METHODS[Methods.DiagnosticsGetProblems]).toBe(true);
  });

  it("does not allowlist privileged methods", () => {
    expect(READ_ONLY_METHODS[Methods.UiShowDiff]).toBeUndefined();
    expect(READ_ONLY_METHODS[Methods.WorkspaceApplyEdit]).toBeUndefined();
    expect(READ_ONLY_METHODS[Methods.TerminalSendText]).toBeUndefined();
  });
});
