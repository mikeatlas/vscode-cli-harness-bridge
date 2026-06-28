import { Methods } from "@vchb/protocol";
import type { BridgeClient } from "../client";
import { printJson } from "../output";

export async function cmdPermission(
  client: BridgeClient,
  args: { method: string; description?: string },
): Promise<void> {
  const result = await client.call(Methods.PermissionRequest, {
    method: args.method,
    description: args.description,
  });
  printJson(result);
}
