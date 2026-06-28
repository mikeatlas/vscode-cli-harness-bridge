import { listSessions } from "@vchb/protocol";
import { canonicalizeWorkspaceRoot } from "../pathMap";
import { printJson } from "../output";
import path from "node:path";

export async function cmdSessions(opts: { json: boolean }): Promise<void> {
  const sessions = await listSessions();
  const cwd = process.cwd();
  const root = canonicalizeWorkspaceRoot(cwd);

  // A session's roots: all workspace folders if recorded, else just `workspace`.
  function rootsOf(s: { workspace: string; workspaces?: string[] }): string[] {
    return s.workspaces && s.workspaces.length > 0 ? s.workspaces : [s.workspace];
  }

  // Find the session this cwd would resolve to (any root exact, then nearest ancestor).
  const c = path.resolve(root);
  const scored = sessions
    .map((s) => {
      const roots = rootsOf(s).map((r) => path.resolve(r));
      const exact = roots.find((r) => r === c);
      const anc = roots.filter((r) => c.startsWith(r + path.sep)).sort((a, b) => b.length - a.length)[0];
      return { s, matchLen: exact ? exact.length : anc ? anc.length : -1 };
    })
    .filter((x) => x.matchLen >= 0)
    .sort((a, b) => b.matchLen - a.matchLen);
  const match = scored[0]?.s;

  const view = sessions.map((s) => ({
    workspace: s.workspace,
    workspaces: rootsOf(s),
    bridge: s.bridge,
    dockerBridge: s.dockerBridge ?? null,
    pid: s.pid,
    createdAt: s.createdAt,
    version: s.version ?? null,
    current: match ? s.workspace === match.workspace : false,
  }));

  if (opts.json) {
    printJson({ cwd, resolvedRoot: root, currentSession: match?.workspace ?? null, sessions: view });
    return;
  }

  if (view.length === 0) {
    process.stdout.write("No VCHB sessions found.\n");
    process.stdout.write(`(cwd ${cwd} resolves to ${root}; no matching window.)\n`);
    return;
  }
  process.stdout.write(`cwd: ${cwd}\n`);
  process.stdout.write(`resolved root: ${root}\n`);
  process.stdout.write(`current session: ${match ? rootsOf(match).join(" + ") : "(no match)"}\n\n`);
  for (const s of view) {
    const mark = s.current ? " *" : "  ";
    const roots = s.workspaces.length > 1 ? `\n     roots: ${s.workspaces.join(", ")}` : "";
    process.stdout.write(`${mark} ${s.workspace}\n     ${s.bridge}  (pid ${s.pid}, ${s.createdAt})${roots}\n`);
  }
}
