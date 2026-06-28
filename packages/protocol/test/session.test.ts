import { describe, it, expect } from "vitest";
import { generateToken, SessionSchema, workspaceHash, workspacesHash, sessionPath } from "@vchb/protocol";

describe("protocol/session", () => {
  it("generates a 32-byte base64url token", () => {
    const t = generateToken();
    expect(t.length).toBeGreaterThanOrEqual(32);
    expect(/^[A-Za-z0-9_-]+$/.test(t)).toBe(true);
  });

  it("hashes workspace roots deterministically and distinctly", () => {
    const a = workspaceHash("/Users/x/proj-a");
    const b = workspaceHash("/Users/x/proj-a");
    const c = workspaceHash("/Users/x/proj-b");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(16);
  });

  it("validates a well-formed session", () => {
    const s = {
      bridge: "http://127.0.0.1:47321",
      token: "abc",
      workspace: "/repo",
      pid: 123,
      createdAt: "2026-06-27T15:00:00Z",
    };
    expect(() => SessionSchema.parse(s)).not.toThrow();
  });

  it("rejects a session with a non-url bridge", () => {
    expect(() =>
      SessionSchema.parse({
        bridge: "not-a-url",
        token: "abc",
        workspace: "/repo",
        pid: 1,
        createdAt: "x",
      }),
    ).toThrow();
  });
  it("validates a multi-root session with workspaces array", () => {
    const s = {
      bridge: "http://127.0.0.1:47321",
      token: "abc",
      workspace: "/repo-a",
      workspaces: ["/repo-a", "/repo-b"],
      pid: 123,
      createdAt: "2026-06-27T15:00:00Z",
    };
    expect(() => SessionSchema.parse(s)).not.toThrow();
  });

  it("workspacesHash is order-independent and distinct from single-root", () => {
    const h1 = workspacesHash(["/repo-a", "/repo-b"]);
    const h2 = workspacesHash(["/repo-b", "/repo-a"]);
    const single = workspacesHash(["/repo-a"]);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(single);
    expect(h1).toHaveLength(16);
  });

  it("workspacesHash of one root equals workspaceHash of that root", () => {
    expect(workspacesHash(["/repo-a"])).toBe(workspaceHash("/repo-a"));
  });

  it("sessionPath is stable for the same root set regardless of order", () => {
    expect(sessionPath(["/a", "/b"])).toBe(sessionPath(["/b", "/a"]));
  });
});
