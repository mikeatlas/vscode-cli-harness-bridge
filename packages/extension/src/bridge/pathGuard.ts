import path from "node:path";
import { vchbThrow } from "./dispatcher";

// Validate that a target path is within the workspace root(s). Rejects path traversal
// outside the workspace unless explicitly allowed.
export function isPathWithinRoot(target: string, root: string, allowOutsideRoot = false): boolean {
  if (allowOutsideRoot) return true;
  const resolved = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  const rel = path.relative(resolvedRoot, resolved);
  // Outside if it climbs above the root.
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function assertPathWithinRoot(target: string, root: string, allowOutsideRoot = false): void {
  if (!isPathWithinRoot(target, root, allowOutsideRoot)) {
    vchbThrow(-32002, `Path is outside the workspace scope: ${target}`); // FORBIDDEN_PATH
  }
}
