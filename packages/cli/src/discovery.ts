import fs from "node:fs";
import path from "node:path";
import { type DiscoveredSession, type Session, listSessions } from "@vchb/protocol";
import { canonicalizeWorkspaceRoot } from "./pathMap";

export interface ResolvedBridge {
  url: string;
  token: string;
  workspace: string;
  session: Session;
  source: "env" | "workspace-match" | "single-fallback";
}

export class DiscoveryError extends Error {
  constructor(public readonly codeName: string, message: string, public readonly candidates?: DiscoveredSession[]) {
    super(message);
    this.name = "DiscoveryError";
  }
}

export interface DiscoveryOptions {
  /** Explicit override (highest precedence). */
  bridgeUrl?: string;
  token?: string;
  /** Workspace to target. */
  workspace?: string;
  /** Current working directory (defaults to process.cwd()). */
  cwd?: string;
  /** Whether to probe /health to prune dead sessions. Default true. */
  probeHealth?: boolean;
  /** Injectable session lister (defaults to real listSessions). For tests. */
  listSessions?: () => Promise<DiscoveredSession[]>;
  /** Injectable reachability probe (defaults to real /health fetch). For tests. */
  probeReachable?: (url: string) => Promise<boolean>;
}

// §5a targeting algorithm.
export async function resolveBridge(env: NodeJS.ProcessEnv = process.env, opts: DiscoveryOptions = {}): Promise<ResolvedBridge> {
  // 1. Explicit env/override URL.
  const explicitUrl = opts.bridgeUrl ?? env.VCHB_BRIDGE_URL;
  const explicitToken = opts.token ?? env.VCHB_BRIDGE_TOKEN;
  if (explicitUrl && explicitToken) {
    const workspace = opts.workspace ?? env.VCHB_WORKSPACE ?? env.WORKSPACE_DIR ?? "";
    return {
      url: explicitUrl,
      token: explicitToken,
      workspace,
      session: {
        bridge: explicitUrl,
        token: explicitToken,
        workspace,
        pid: 0,
        createdAt: new Date(0).toISOString(),
      },
      source: "env",
    };
  }

  // 2-3. Determine the target workspace root.
  const wsHint = opts.workspace ?? env.VCHB_WORKSPACE ?? env.WORKSPACE_DIR;
  const cwd = opts.cwd ?? process.cwd();
  const root = wsHint ? canonicalizeWorkspaceRoot(wsHint) : canonicalizeWorkspaceRoot(cwd);

  // 4. Enumerate session files; prune dead.
  const probe = opts.probeHealth ?? true;
  const lister = opts.listSessions ?? listSessions;
  const reachable = opts.probeReachable ?? isReachable;
  const sessions = await lister();
  const live: DiscoveredSession[] = [];
  for (const s of sessions) {
    if (probe && !(await reachable(s.bridge))) continue;
    live.push(s);
  }

  if (live.length === 0) {
    throw new DiscoveryError(
      "BRIDGE_UNAVAILABLE",
      `No live VCHB bridge found for workspace "${root}". ` +
        `Open the project in VS Code with the extension active, or set VCHB_BRIDGE_URL + VCHB_BRIDGE_TOKEN.`,
    );
  }

  // 5. Exact-equal match first, then nearest ancestor.
  // A session's roots: all workspace folders if recorded (multi-root), else just `workspace`.
  function rootsOf(s: DiscoveredSession): string[] {
    return s.workspaces && s.workspaces.length > 0 ? s.workspaces : [s.workspace];
  }

  // Exact-equal match against any root.
  let exact = live.filter((s) => rootsOf(s).some((r) => samePath(r, root)));
  if (exact.length > 1) {
    throw new DiscoveryError(
      "AMBIGUOUS",
      `Multiple sessions match workspace "${root}" exactly. Set VCHB_BRIDGE_URL or --workspace to disambiguate.`,
      exact,
    );
  }
  if (exact.length === 1) {
    return fromSession(exact[0], "workspace-match");
  }

  // Nearest-ancestor match against any root.
  const ancestors = live
    .map((s) => ({ s, r: rootsOf(s).map((r) => isAncestorOrEqual(r, root) ? r : null).filter(Boolean).sort((a, b) => (b as string).length - (a as string).length)[0] as string | undefined }))
    .filter((x) => x.r)
    .sort((a, b) => (b.r as string).length - (a.r as string).length);
  if (ancestors.length > 1) {
    const nearest = ancestors[0].r as string;
    const tied = ancestors.filter((x) => (x.r as string).length === nearest.length);
    if (tied.length > 1) {
      throw new DiscoveryError(
        "AMBIGUOUS",
        `Multiple sessions are ancestors of "${root}". Set VCHB_BRIDGE_URL or --workspace to disambiguate.`,
        tied.map((x) => x.s),
      );
    }
  }
  if (ancestors.length >= 1) {
    return fromSession(ancestors[0].s, "workspace-match");
  }

  // 6. Single-session fallback.
  if (live.length === 1) {
    return fromSession(live[0], "single-fallback");
  }

  throw new DiscoveryError(
    "AMBIGUOUS",
    `No session matches workspace "${root}", and ${live.length} live sessions exist. ` +
      `Set VCHB_BRIDGE_URL or --workspace to disambiguate.`,
    live,
  );
}

function fromSession(s: DiscoveredSession, source: ResolvedBridge["source"]): ResolvedBridge {
  return { url: s.bridge, token: s.token, workspace: s.workspace, session: s, source };
}

function samePath(a: string, b: string): boolean {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return path.resolve(a) === path.resolve(b);
  }
}

function isAncestorOrEqual(parent: string, child: string): boolean {
  const p = path.resolve(parent);
  const c = path.resolve(child);
  if (p === c) return true;
  const rel = path.relative(p, c);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const resp = await fetch(`${url}/health`, { signal: controller.signal });
      return resp.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}
