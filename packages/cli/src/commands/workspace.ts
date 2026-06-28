import path from "node:path";
import { Methods } from "@vchb/protocol";
import type { BridgeClient } from "../client";
import { printJson } from "../output";
import { loadPathMap } from "../pathMap";

export async function cmdReadFile(client: BridgeClient, args: { path: string }): Promise<void> {
  const pm = loadPathMap();
  const result = await client.call(Methods.WorkspaceReadFile, { path: pm.mapToHost(path.resolve(args.path)) });
  printJson(result);
}

export async function cmdApplyEdit(
  client: BridgeClient,
  args: { path: string; editJson?: string; wholeFile?: string },
): Promise<void> {
  const pm = loadPathMap();
  const params: { path: string; edits?: unknown[]; wholeFile?: string } = {
    path: pm.mapToHost(path.resolve(args.path)),
  };
  if (args.wholeFile !== undefined) {
    params.wholeFile = args.wholeFile;
  } else if (args.editJson) {
    params.edits = JSON.parse(args.editJson);
  }
  const result = await client.call(Methods.WorkspaceApplyEdit, params);
  printJson(result);
}

export async function cmdSave(client: BridgeClient, args: { path: string }): Promise<void> {
  const pm = loadPathMap();
  const result = await client.call(Methods.WorkspaceSaveDocument, { path: pm.mapToHost(path.resolve(args.path)) });
  printJson(result);
}
