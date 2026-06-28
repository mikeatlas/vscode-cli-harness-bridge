import path from "node:path";
import { Methods } from "@vchb/protocol";
import type { BridgeClient } from "../client";
import { printJson } from "../output";
import { loadPathMap } from "../pathMap";

export async function cmdDiagnostics(
  client: BridgeClient,
  args: { path?: string; workspace: boolean },
): Promise<void> {
  const params: { uri?: string; workspace?: boolean } = {};
  if (args.workspace) {
    params.workspace = true;
  } else if (args.path) {
    const pm = loadPathMap();
    const hostPath = pm.mapToHost(path.resolve(args.path));
    params.uri = `file://${hostPath}`;
  }
  const result = await client.call(Methods.DiagnosticsGetProblems, params);
  printJson(result);
}
