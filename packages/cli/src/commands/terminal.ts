import { Methods } from "@vchb/protocol";
import type { BridgeClient } from "../client";
import { printJson } from "../output";

export async function cmdTerminalCreate(
  client: BridgeClient,
  args: { name?: string; reuse: boolean },
): Promise<void> {
  const result = await client.call(Methods.TerminalCreate, {
    name: args.name,
    reuse: args.reuse,
  });
  printJson(result);
}

export async function cmdTerminalSend(
  client: BridgeClient,
  args: { terminalId?: number; text: string; addNewLine: boolean },
): Promise<void> {
  const result = await client.call(Methods.TerminalSendText, {
    terminalId: args.terminalId,
    text: args.text,
    addNewLine: args.addNewLine,
  });
  printJson(result);
}
