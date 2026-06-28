import type {
  ActiveEditorResult,
  ApplyEditParams,
  ApplyEditResult,
  GetProblemsParams,
  GetProblemsResult,
  PermissionOutcome,
  Position,
  Range,
  ReadFileResult,
  SaveDocumentResult,
  SelectionResult,
  TerminalCreateParams,
  TerminalCreateResult,
  TerminalSendTextParams,
  TerminalSendTextResult,
  UiShowDiffParams,
  UiShowDiffResult,
} from "@vchb/protocol";

// The editor-facing surface the dispatcher depends on. Only vscodeAdapter.ts implements
// this against the real `vscode` API; tests inject a fake. Keeps the core headless-testable.
export interface EditorAdapter {
  getActiveEditor(): Promise<ActiveEditorResult | null>;
  getSelection(): Promise<SelectionResult | null>;
  showDiff(params: UiShowDiffParams): Promise<UiShowDiffResult>;
  getProblems(params: GetProblemsParams): Promise<GetProblemsResult>;
  requestPermission(method: string, description?: string): Promise<PermissionOutcome>;
  readFile(path: string): Promise<ReadFileResult>;
  applyEdit(params: ApplyEditParams): Promise<ApplyEditResult>;
  saveDocument(path: string): Promise<SaveDocumentResult>;
  terminalCreate(params: TerminalCreateParams): Promise<TerminalCreateResult>;
  terminalSendText(params: TerminalSendTextParams): Promise<TerminalSendTextResult>;
}

export type { ActiveEditorResult, Position, Range, SelectionResult };
