import { describe, it, expect } from "vitest";
import { resolveBridge, DiscoveryError } from "../src/discovery";
import type { DiscoveredSession } from "@vchb/protocol";

function makeSession(workspace: string, port: number): DiscoveredSession {
  return {
    bridge: `http://127.0.0.1:${port}`,
    token: `tok-${port}`,
    workspace,
    pid: 1000 + port,
    createdAt: "2026-06-27T00:00:00Z",
    version: "test",
    file: `/fake/${workspace}.json`,
  };
}

function makeMultiRootSession(workspaces: string[], port: number): DiscoveredSession {
  return {
    ...makeSession(workspaces[0], port),
    workspaces,
    file: `/fake/multi-${port}.json`,
  };
}

// All sessions reachable in tests.
const alwaysReachable = async (): Promise<boolean> => true;

describe("discovery", () => {
  it("uses explicit VCHB_BRIDGE_URL + token when both set", async () => {
    const r = await resolveBridge(
      { VCHB_BRIDGE_URL: "http://127.0.0.1:9999", VCHB_BRIDGE_TOKEN: "secret" },
      { listSessions: async () => [], probeReachable: alwaysReachable, cwd: "/repo" },
    );
    expect(r.url).toBe("http://127.0.0.1:9999");
    expect(r.token).toBe("secret");
    expect(r.source).toBe("env");
  });

  it("matches a session whose workspace root equals the cwd", async () => {
    const sessions = [makeSession("/repo-a", 1), makeSession("/repo-b", 2)];
    const r = await resolveBridge(
      {},
      { listSessions: async () => sessions, probeReachable: alwaysReachable, cwd: "/repo-a" },
    );
    expect(r.url).toBe("http://127.0.0.1:1");
    expect(r.source).toBe("workspace-match");
  });

  it("matches the nearest ancestor session when no exact match", async () => {
    const sessions = [makeSession("/repo", 1), makeSession("/repo/nested", 2)];
    const r = await resolveBridge(
      {},
      { listSessions: async () => sessions, probeReachable: alwaysReachable, cwd: "/repo/nested/deep/file.ts" },
    );
    expect(r.url).toBe("http://127.0.0.1:2");
  });

  it("keeps two worktrees of the same repo distinct (each resolves to its own toplevel)", async () => {
    // Simulate two worktree workspaces; canonicalizeWorkspaceRoot uses git, but for the
    // matching test we pass the worktree roots directly as cwd.
    const sessions = [
      makeSession("/Users/x/proj", 1),
      makeSession("/Users/x/proj@feature", 2),
    ];
    const r1 = await resolveBridge(
      {},
      { listSessions: async () => sessions, probeReachable: alwaysReachable, cwd: "/Users/x/proj@feature" },
    );
    expect(r1.url).toBe("http://127.0.0.1:2");

    const r2 = await resolveBridge(
      {},
      { listSessions: async () => sessions, probeReachable: alwaysReachable, cwd: "/Users/x/proj" },
    );
    expect(r2.url).toBe("http://127.0.0.1:1");
  });

  it("falls back to the single live session when no match", async () => {
    const sessions = [makeSession("/only-repo", 1)];
    const r = await resolveBridge(
      {},
      { listSessions: async () => sessions, probeReachable: alwaysReachable, cwd: "/somewhere/else" },
    );
    expect(r.url).toBe("http://127.0.0.1:1");
    expect(r.source).toBe("single-fallback");
  });

  it("throws BRIDGE_UNAVAILABLE when no sessions exist", async () => {
    await expect(
      resolveBridge({}, { listSessions: async () => [], probeReachable: alwaysReachable, cwd: "/repo" }),
    ).rejects.toBeInstanceOf(DiscoveryError);
    try {
      await resolveBridge({}, { listSessions: async () => [], probeReachable: alwaysReachable, cwd: "/repo" });
    } catch (e) {
      if (!(e instanceof DiscoveryError)) throw e;
      expect(e.codeName).toBe("BRIDGE_UNAVAILABLE");
    }
  });

  it("throws AMBIGUOUS when multiple sessions match and none is nearest", async () => {
    const sessions = [makeSession("/a", 1), makeSession("/b", 2)];
    await expect(
      resolveBridge(
        {},
        { listSessions: async () => sessions, probeReachable: alwaysReachable, cwd: "/somewhere/else" },
      ),
    ).rejects.toBeInstanceOf(DiscoveryError);
  });

  it("prunes unreachable sessions via the probe", async () => {
    const sessions = [makeSession("/repo", 1), makeSession("/dead", 2)];
    const r = await resolveBridge(
      {},
      {
        listSessions: async () => sessions,
        probeReachable: async (url) => !url.endsWith(":2"),
        cwd: "/repo",
      },
    );
    expect(r.url).toBe("http://127.0.0.1:1");
  });
  it("matches a multi-root session by any of its folders", async () => {
    // One window with two folders: omp-sbx and vscode-cli-harness-bridge.
    const sessions = [makeMultiRootSession([
      "/Users/mike/src/omp-sbx",
      "/Users/mike/src/vscode-cli-harness-bridge",
    ], 1)];
    // cwd inside the SECOND folder should still match this session.
    const r = await resolveBridge(
      {},
      {
        listSessions: async () => sessions,
        probeReachable: alwaysReachable,
        cwd: "/Users/mike/src/vscode-cli-harness-bridge/packages/cli",
      },
    );
    expect(r.url).toBe("http://127.0.0.1:1");
    expect(r.source).toBe("workspace-match");
  });

  it("multi-root session matches when cwd equals any root exactly", async () => {
    const sessions = [makeMultiRootSession(["/a", "/b"], 1)];
    const r = await resolveBridge(
      {},
      { listSessions: async () => sessions, probeReachable: alwaysReachable, cwd: "/b" },
    );
    expect(r.url).toBe("http://127.0.0.1:1");
  });
});
