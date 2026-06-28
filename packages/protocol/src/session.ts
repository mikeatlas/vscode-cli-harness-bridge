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
  return path.join(os.homedir(), ".vscode-cli-harness-bridge", "sessions");
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
  // Ensure 0600 even if file pre-existed.
  await fs.promises.chmod(file, 0o600);
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
}

export interface DiscoveredSession extends Session {
  /** Absolute path of the session file. */
  file: string;
}

export async function listSessions(): Promise<DiscoveredSession[]> {
  const dir = sessionsDir();
  let files: string[] = [];
  try {
    files = await fs.promises.readdir(dir);
  } catch {
    return [];
  }
  const out: DiscoveredSession[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const file = path.join(dir, f);
    try {
      const raw = await fs.promises.readFile(file, "utf8");
      out.push({ ...SessionSchema.parse(JSON.parse(raw)), file });
    } catch {
      /* skip malformed/stale */
    }
  }
  return out;
}
