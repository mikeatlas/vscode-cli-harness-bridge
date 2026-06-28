import * as vscode from "vscode";
import path from "node:path";
import type {
  ActiveEditorResult,
  DiagnosticItem,
  GetProblemsParams,
  GetProblemsResult,
  PermissionOutcome,
  Position,
  Range,
  SelectionResult,
  UiShowDiffParams,
  UiShowDiffResult,
} from "@vchb/protocol";
import type { EditorAdapter } from "./adapter.types";
import { isPathWithinRoot } from "../bridge/pathGuard";
import { vchbThrow } from "../bridge/dispatcher";

// Snapshot of an editor + its selection, so we can return the *last* editor when no text
// editor currently has focus (terminal, preview, settings, etc. focused). Without this, an
// agent running `vchb selection` from a terminal would always see NO_ACTIVE_EDITOR because
// focusing the terminal blanks `activeTextEditor`.
interface EditorSnapshot {
  uri: string;
  fileName: string;
  languageId: string;
  isDirty: boolean;
  range: Range;
  text: string;
}

function snapshot(editor: vscode.TextEditor): EditorSnapshot {
  const doc = editor.document;
  const sel = editor.selection;
  const range: Range = {
    start: { line: sel.start.line, character: sel.start.character } as Position,
    end: { line: sel.end.line, character: sel.end.character } as Position,
  };
  return {
    uri: doc.uri.toString(),
    fileName: doc.fileName,
    languageId: doc.languageId,
    isDirty: doc.isDirty,
    range,
    text: doc.getText(sel),
  };
}

export class VsCodeAdapter implements EditorAdapter {
  private last: EditorSnapshot | null = null;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly workspaceState: vscode.Memento | undefined;

  constructor(workspaceState?: vscode.Memento) {
    this.workspaceState = workspaceState;
    const active = vscode.window.activeTextEditor;
    if (active) this.last = snapshot(active);

    // Remember the most recently active text editor and its latest selection.
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((ed) => {
        if (ed) this.last = snapshot(ed);
      }),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor) this.last = snapshot(e.textEditor);
      }),
    );
  }

  // Returns the focused editor if one has focus; otherwise the most recently active text
  // editor (so terminal/preview focus doesn't blank the result).
  async getActiveEditor(): Promise<ActiveEditorResult | null> {
    const ed = vscode.window.activeTextEditor;
    if (ed) {
      const s = snapshot(ed);
      return { uri: s.uri, fileName: s.fileName, languageId: s.languageId, isDirty: s.isDirty };
    }
    if (this.last) {
      return {
        uri: this.last.uri,
        fileName: this.last.fileName,
        languageId: this.last.languageId,
        isDirty: this.last.isDirty,
      };
    }
    return null;
  }

  // Returns the focused editor's selection if focused; otherwise the last-known selection
  // of the most recently active editor.
  async getSelection(): Promise<SelectionResult | null> {
    const ed = vscode.window.activeTextEditor;
    if (ed) {
      const s = snapshot(ed);
      return { uri: s.uri, fileName: s.fileName, languageId: s.languageId, range: s.range, text: s.text };
    }
    if (this.last) {
      return {
        uri: this.last.uri,
        fileName: this.last.fileName,
        languageId: this.last.languageId,
        range: this.last.range,
        text: this.last.text,
      };
    }
    return null;
  }

  async showDiff(params: UiShowDiffParams): Promise<UiShowDiffResult> {
    const orig = path.resolve(params.originalPath);
    const proposed = path.resolve(params.proposedPath);
    const folders = vscode.workspace.workspaceFolders ?? [];
    // Only guard the original path (must be a workspace file). The proposed path is often
    // an agent-created temp file outside the workspace — that's intentional.
    const origInside = folders.some((f) => isPathWithinRoot(orig, f.uri.fsPath));
    if (!origInside) vchbThrow(-32002, `Original path is outside the workspace scope: ${orig}`);
    await vscode.commands.executeCommand(
      "vscode.diff",
      vscode.Uri.file(orig),
      vscode.Uri.file(proposed),
      params.title ?? "Proposed change",
    );
    return { opened: true };
  }

  async getProblems(params: GetProblemsParams): Promise<GetProblemsResult> {
    const SEVERITY: Record<number, string> = {
      0: "error",
      1: "warning",
      2: "information",
      3: "hint",
    };

    if (params.workspace) {
      const all = vscode.languages.getDiagnostics();
      const diagnostics: DiagnosticItem[] = [];
      for (const [, diags] of all) {
        for (const d of diags) {
          diagnostics.push({
            severity: SEVERITY[d.severity] ?? "error",
            message: d.message,
            source: d.source,
            range: {
              start: { line: d.range.start.line, character: d.range.start.character },
              end: { line: d.range.end.line, character: d.range.end.character },
            },
          });
        }
      }
      return { diagnostics };
    }

    let uri: vscode.Uri | undefined;
    if (params.uri) {
      uri = vscode.Uri.parse(params.uri);
    } else {
      const ed = vscode.window.activeTextEditor;
      if (ed) uri = ed.document.uri;
    }
    if (!uri) return { diagnostics: [] };

    const diags = vscode.languages.getDiagnostics(uri);
    return {
      diagnostics: diags.map((d) => ({
        severity: SEVERITY[d.severity] ?? "error",
        message: d.message,
        source: d.source,
        range: {
          start: { line: d.range.start.line, character: d.range.start.character },
          end: { line: d.range.end.line, character: d.range.end.character },
        },
      })),
    };
  }

  async requestPermission(method: string, description?: string): Promise<PermissionOutcome> {
    const key = `vchb:allow:${method}`;
    // Check persisted allow_always decision in workspace state.
    if (this.workspaceState?.get<string>(key) === "allow_always") return "allow_always";

    const detail = description ?? `Method: ${method}`;
    const choice = await vscode.window.showInformationMessage(
      `VCHB permission request`,
      { modal: true, detail },
      "Allow once",
      "Allow always",
      "Deny",
    );
    switch (choice) {
      case "Allow once":
        return "allow_once";
      case "Allow always":
        await this.workspaceState?.update(key, "allow_always");
        return "allow_always";
      default:
        return "deny";
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
