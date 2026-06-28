import { z } from "zod";

// JSON-RPC method name constants.
export const Methods = {
  EditorGetActiveEditor: "editor/getActiveEditor",
  EditorGetSelection: "editor/getSelection",
  UiShowDiff: "ui/showDiff",
  DiagnosticsGetProblems: "diagnostics/getProblems",
  WorkspaceReadFile: "workspace/readFile",
  WorkspaceApplyEdit: "workspace/applyEdit",
  WorkspaceSaveDocument: "workspace/saveDocument",
  TerminalCreate: "terminal/create",
  TerminalSendText: "terminal/sendText",
  PermissionRequest: "permission/request",
} as const;

export type MethodName = (typeof Methods)[keyof typeof Methods];

export const READ_ONLY_METHODS: Record<string, true> = {
  [Methods.EditorGetActiveEditor]: true,
  [Methods.EditorGetSelection]: true,
  [Methods.DiagnosticsGetProblems]: true,
};
export const PositionSchema = z.object({
  line: z.number().int().min(0),
  character: z.number().int().min(0),
});
export type Position = z.infer<typeof PositionSchema>;

export const RangeSchema = z.object({
  start: PositionSchema,
  end: PositionSchema,
});
export type Range = z.infer<typeof RangeSchema>;

// ---- editor/getActiveEditor ----

export const GetActiveEditorParamsSchema = z.object({}).default({});
export type GetActiveEditorParams = z.infer<typeof GetActiveEditorParamsSchema>;

export const ActiveEditorResultSchema = z.object({
  uri: z.string(),
  fileName: z.string(),
  languageId: z.string(),
  isDirty: z.boolean(),
});
export type ActiveEditorResult = z.infer<typeof ActiveEditorResultSchema>;

// ---- editor/getSelection ----

export const GetSelectionParamsSchema = z.object({}).default({});
export type GetSelectionParams = z.infer<typeof GetSelectionParamsSchema>;

export const SelectionResultSchema = z.object({
  uri: z.string(),
  fileName: z.string(),
  languageId: z.string(),
  range: RangeSchema,
  text: z.string(),
});
export type SelectionResult = z.infer<typeof SelectionResultSchema>;

// ---- ui/showDiff ----

export const UiShowDiffParamsSchema = z.object({
  originalPath: z.string(),
  proposedPath: z.string(),
  title: z.string().optional(),
});
export type UiShowDiffParams = z.infer<typeof UiShowDiffParamsSchema>;

export const UiShowDiffResultSchema = z.object({
  opened: z.boolean(),
});
export type UiShowDiffResult = z.infer<typeof UiShowDiffResultSchema>;

// ---- diagnostics/getProblems ----

export const GetProblemsParamsSchema = z.object({
  uri: z.string().optional(),
  workspace: z.boolean().optional(),
}).default({});
export type GetProblemsParams = z.infer<typeof GetProblemsParamsSchema>;

const DiagnosticItemSchema = z.object({
  severity: z.string(),
  message: z.string(),
  source: z.string().optional(),
  range: RangeSchema,
});
export type DiagnosticItem = z.infer<typeof DiagnosticItemSchema>;

export const GetProblemsResultSchema = z.object({
  diagnostics: z.array(DiagnosticItemSchema),
});
export type GetProblemsResult = z.infer<typeof GetProblemsResultSchema>;

// ---- permission/request ----

export const PermissionOutcome = z.enum(["allow_once", "allow_always", "deny"]);
export type PermissionOutcome = z.infer<typeof PermissionOutcome>;

export const PermissionRequestParamsSchema = z.object({
  method: z.string(),
  description: z.string().optional(),
  args: z.record(z.unknown()).optional(),
});
export type PermissionRequestParams = z.infer<typeof PermissionRequestParamsSchema>;

export const PermissionRequestResultSchema = z.object({
  outcome: PermissionOutcome,
});
export type PermissionRequestResult = z.infer<typeof PermissionRequestResultSchema>;
