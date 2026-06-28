import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function outputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("VCHB Bridge");
  }
  return channel;
}

export function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  outputChannel().appendLine(line);
  if (process.env.VCHB_DEBUG) {
    // eslint-disable-next-line no-console
    console.error(line);
  }
}
