import path from "node:path";
import { Methods } from "@vchb/protocol";
import type { BridgeClient } from "../client";
import { printJson } from "../output";
import { loadPathMap } from "../pathMap";

export async function cmdDiff(
  client: BridgeClient,
  args: { originalPath: string; proposedPath: string; title?: string },
): Promise<void> {
  const pm = loadPathMap();
  const result = await client.call(Methods.UiShowDiff, {
    originalPath: pm.mapToHost(path.resolve(args.originalPath)),
    proposedPath: pm.mapToHost(path.resolve(args.proposedPath)),
    title: args.title,
  });
  printJson(result);
}
