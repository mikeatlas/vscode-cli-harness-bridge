import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// Session file schema (written by the extension, read by the CLI).
// `workspace` is the primary (first) workspace folder, kept for back-compat.
// `workspaces` lists ALL workspace folder roots (multi-root workspaces); `workspace`
// is always duplicated as the first entry of `workspaces` when present.
export const SessionSchema = z.object({
  bridge: z.string().url(),
  dockerBridge: z.string().url().optional(),
  token: z.string(),
  workspace: z.string(),
  workspaces: z.array(z.string()).optional(),
  pid: z.number().int(),
  createdAt: z.string(),
  version: z.string().optional(),
});
export type Session = z.infer<typeof SessionSchema>;

export function sessionsDir(): string {
  return process.env.VCHB_SESSIONS_DIR
    ?? path.join(os.homedir(), ".vscode-cli-harness-bridge", "sessions");
}

// Workspace-local session dir — written into the workspace so containers can discover it.
export function workspaceSessionDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".vchb");
}

// Hash of a canonical workspace root -> stable session filename per window.
export function workspaceHash(root: string): string {
  return crypto.createHash("sha1").update(path.resolve(root)).digest("hex").slice(0, 16);
}

// Hash of the full set of workspace roots (multi-root aware). One window → one file,
// regardless of folder order. Single-root falls back to workspaceHash.
export function workspacesHash(roots: string[]): string {
  const unique = Array.from(new Set(roots.map((r) => path.resolve(r)))).sort();
  if (unique.length <= 1) return workspaceHash(unique[0] ?? "");
  return crypto.createHash("sha1").update(unique.join("\n")).digest("hex").slice(0, 16);
}

// Session file path for a window identified by its (possibly multiple) roots.
export function sessionPath(roots: string[]): string {
  return path.join(sessionsDir(), `${workspacesHash(roots)}.json`);
}

// Back-compat single-root path.
export function sessionPathForRoot(root: string): string {
  return sessionPath([root]);
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function writeSession(session: Session): Promise<string> {
  const dir = sessionsDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const roots = session.workspaces && session.workspaces.length > 0
    ? session.workspaces
    : [session.workspace];
  const file = sessionPath(roots);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(session, null, 2), { mode: 0o600 });
  await fs.promises.rename(tmp, file);
  await fs.promises.chmod(file, 0o600);

  // Also write a workspace-local copy so containers (omp-sbx) can discover it.
  // Written to <workspace>/.vchb/session.json — visible because the workspace is bind-mounted.
  for (const root of roots) {
    try {
      const localDir = workspaceSessionDir(root);
      await fs.promises.mkdir(localDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(localDir, "session.json"),
        JSON.stringify(session, null, 2),
        { mode: 0o600 },
      );
    } catch {
      /* workspace dir may not be writable; skip */
    }
  }
  return file;
}

export async function readSession(roots: string[]): Promise<Session | null> {
  try {
    const raw = await fs.promises.readFile(sessionPath(roots), "utf8");
    return SessionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function deleteSession(roots: string[]): Promise<void> {
  try {
    await fs.promises.unlink(sessionPath(roots));
  } catch {
    /* ignore */
  }
  for (const root of roots) {
    try {
      await fs.promises.unlink(path.join(workspaceSessionDir(root), "session.json"));
    } catch {
      /* ignore */
    }
  }
}

export interface DiscoveredSession extends Session {
  /** Absolute path of the session file. */
  file: string;
}

export async function listSessions(): Promise<DiscoveredSession[]> {
  const out: DiscoveredSession[] = [];
  const seen = new Set<string>();

  // 1. Scan the central sessions dir (host-side).
  const dir = sessionsDir();
  try {
    const files = await fs.promises.readdir(dir);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const file = path.join(dir, f);
      try {
        const raw = await fs.promises.readFile(file, "utf8");
        const s = SessionSchema.parse(JSON.parse(raw));
        if (!seen.has(s.bridge)) {
          out.push({ ...s, file });
          seen.add(s.bridge);
        }
      } catch {
        /* skip malformed/stale */
      }
    }
  } catch {
    /* dir doesn't exist */
  }

  // 2. Scan workspace-local .vchb/session.json (container-side discovery).
  // Walk up from cwd looking for .vchb/session.json.
  let searchDir = process.cwd();
  for (let i = 0; i < 20; i++) {
    const localFile = path.join(searchDir, ".vchb", "session.json");
    try {
      const raw = await fs.promises.readFile(localFile, "utf8");
      const s = SessionSchema.parse(JSON.parse(raw));
      if (!seen.has(s.bridge)) {
        out.push({ ...s, file: localFile });
        seen.add(s.bridge);
      }
    } catch {
      /* not found */
    }
    const parent = path.dirname(searchDir);
    if (parent === searchDir) break;
    searchDir = parent;
  }

  return out;
}
