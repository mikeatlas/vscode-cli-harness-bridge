import * as vscode from "vscode";

let statusBar: vscode.StatusBarItem | undefined;

export function showStatusBar(port: number): void {
  if (!statusBar) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = "vchb.showSessions";
  }
  statusBar.text = `$(radio-tower) VCHB :${port}`;
  statusBar.tooltip = "vscode-cli-harness-bridge active. Click to show sessions.";
  statusBar.show();
}

export function hideStatusBar(): void {
  statusBar?.hide();
}

export function disposeStatusBar(): void {
  statusBar?.dispose();
  statusBar = undefined;
}
