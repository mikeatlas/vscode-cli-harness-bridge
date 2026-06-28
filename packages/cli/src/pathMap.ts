import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

// Container -> host path rewriting. omp-sbx bind-mounts the workspace at the identical
// absolute path, so the default is identity. VCHB_PATH_MAP=containerRoot=hostRoot overrides
// for generic harnesses that mount elsewhere.
export interface PathMap {
  mapToHost(p: string): string;
  mapFromHost(p: string): string;
  isIdentity: boolean;
}

export function loadPathMap(env: NodeJS.ProcessEnv = process.env): PathMap {
  const raw = env.VCHB_PATH_MAP;
  if (!raw) {
    return identity;
  }
  const eq = raw.indexOf("=");
  if (eq < 0) {
    return identity;
  }
  const containerRoot = raw.slice(0, eq);
  const hostRoot = raw.slice(eq + 1);
  if (!containerRoot || !hostRoot) return identity;
  return {
    isIdentity: false,
    mapToHost(p) {
      return p.startsWith(containerRoot) ? path.join(hostRoot, p.slice(containerRoot.length)) : p;
    },
    mapFromHost(p) {
      return p.startsWith(hostRoot) ? path.join(containerRoot, p.slice(hostRoot.length)) : p;
    },
  };
}

const identity: PathMap = {
  isIdentity: true,
  mapToHost: (p) => p,
  mapFromHost: (p) => p,
};

// Resolve a cwd to its canonical workspace root: realpath + git toplevel so worktrees
// (repo@worktree) resolve to the worktree's own toplevel, keeping windows distinct.
export function canonicalizeWorkspaceRoot(cwd: string): string {
  let real = cwd;
  try {
    real = fs.realpathSync(cwd);
  } catch {
    /* keep cwd */
  }
  try {
    const toplevel = execSync("git rev-parse --show-toplevel", {
      cwd: real,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    if (toplevel) {
      try {
        return fs.realpathSync(toplevel);
      } catch {
        return toplevel;
      }
    }
  } catch {
    /* not a git repo */
  }
  return real;
}
