import { type ActiveEditorResult, type SelectionResult, Methods } from "@vchb/protocol";
import { BridgeClient } from "../client";
import { printJson } from "../output";

export async function cmdActiveEditor(client: BridgeClient): Promise<void> {
  const result = await client.call<ActiveEditorResult>(Methods.EditorGetActiveEditor);
  printJson(result);
}

export async function cmdSelection(client: BridgeClient): Promise<void> {
  const result = await client.call<SelectionResult>(Methods.EditorGetSelection);
  printJson(result);
}
