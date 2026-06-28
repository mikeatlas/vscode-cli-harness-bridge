import * as vscode from "vscode";
import { createDispatcher } from "./bridge/dispatcher";
import { startBridgeServer, type BridgeServer } from "./bridge/server";
import { VsCodeAdapter } from "./adapter/vscodeAdapter";
import { deleteSession, generateToken, writeSession } from "@vchb/protocol";
import { log } from "./ui/log";
import { disposeStatusBar, hideStatusBar, showStatusBar } from "./ui/statusBar";

const VERSION = "0.0.0";

let bridge: BridgeServer | undefined;
let adapter: VsCodeAdapter | undefined;

function workspaceRoots(): string[] {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders.map((f) => f.uri.fsPath);
  }
  return [process.cwd()];
}

async function startBridge(workspaceState?: vscode.Memento): Promise<BridgeServer> {
  const cfg = vscode.workspace.getConfiguration("vchb");
  const bindAddress = cfg.get<string>("bindAddress", "127.0.0.1");
  const port = cfg.get<number>("port", 0);
  const allowOutsideRoot = cfg.get<boolean>("allowOutsideRoot", false);
  const roots = workspaceRoots();
  const primaryRoot = roots[0];
  const token = generateToken();

  // Dispose any prior adapter (e.g. on restart).
  adapter?.dispose();
  adapter = new VsCodeAdapter(workspaceState);

  const dispatcher = createDispatcher({
    adapter,
    workspaceRoot: primaryRoot,
    allowOutsideRoot,
  });

  const server = await startBridgeServer({
    bindAddress,
    port,
    token,
    workspaceRoot: primaryRoot,
    workspaces: roots,
    version: VERSION,
    dispatcher,
  });

  await writeSession(server.session);
  showStatusBar(server.port);
  log(`Bridge started on ${server.url} for workspace(s) ${roots.join(", ")}`);
  return server;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    bridge = await startBridge(context.workspaceState);
  } catch (e) {
    log(`Failed to start bridge: ${(e as Error).message}`);
    vscode.window.showErrorMessage(`VCHB bridge failed to start: ${(e as Error).message}`);
    return;
  }

  context.subscriptions.push(
    { dispose: () => disposeStatusBar() },
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vchb.restartBridge", async () => {
      try {
        await bridge?.close();
        bridge = await startBridge(context.workspaceState);
        vscode.window.showInformationMessage(`VCHB bridge restarted on ${bridge.url}`);
      } catch (e) {
        vscode.window.showErrorMessage(`VCHB restart failed: ${(e as Error).message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vchb.copyEnv", async () => {
      if (!bridge) return;
      const env =
        `export VCHB_BRIDGE_URL=${bridge.url}\n` +
        `export VCHB_BRIDGE_TOKEN=${bridge.session.token}\n` +
        `export VCHB_WORKSPACE=${bridge.session.workspace}\n`;
      await vscode.env.clipboard.writeText(env);
      vscode.window.showInformationMessage("VCHB env vars copied to clipboard");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vchb.showSessions", async () => {
      const doc = `Bridge: ${bridge?.url ?? "(not running)"}\n` +
        `Workspace: ${bridge?.session.workspace ?? "(none)"}\n` +
        `Token: ${bridge ? bridge.session.token.slice(0, 8) + "…" : "(none)"}\n` +
        `PID: ${bridge?.session.pid ?? "(none)"}\n`;
      const channel = vscode.window.createOutputChannel("VCHB Sessions");
      channel.appendLine(doc);
      channel.show();
    }),
  );
}

export async function deactivate(): Promise<void> {
  hideStatusBar();
  if (bridge) {
    try {
      await deleteSession(bridge.session.workspaces ?? [bridge.session.workspace]);
      await bridge.close();
    } catch (e) {
      log(`Error during deactivation: ${(e as Error).message}`);
    }
    bridge = undefined;
  }
  adapter?.dispose();
  adapter = undefined;
}
