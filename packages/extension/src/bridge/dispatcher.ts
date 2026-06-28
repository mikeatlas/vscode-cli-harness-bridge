import { ZodError } from "zod";
import {
  ApplyEditParamsSchema,
  GetActiveEditorParamsSchema,
  GetProblemsParamsSchema,
  GetSelectionParamsSchema,
  Methods,
  PermissionRequestParamsSchema,
  ReadFileParamsSchema,
  SaveDocumentParamsSchema,
  TerminalCreateParamsSchema,
  TerminalSendTextParamsSchema,
  UiShowDiffParamsSchema,
  type ApplyEditParams,
  type GetProblemsParams,
  type JsonRpcError,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type PermissionRequestParams,
  type ReadFileParams,
  type SaveDocumentParams,
  type TerminalCreateParams,
  type TerminalSendTextParams,
  type UiShowDiffParams,
} from "@vchb/protocol";
import type { EditorAdapter } from "../adapter/adapter.types";

// Standard JSON-RPC error code constants.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
const NO_ACTIVE_EDITOR = -32003;
export type MethodHandler = (params: unknown) => Promise<unknown>;
const PARAM_SCHEMAS: Record<string, (v: unknown) => unknown> = {
  [Methods.EditorGetActiveEditor]: (v) => GetActiveEditorParamsSchema.parse(v ?? {}),
  [Methods.EditorGetSelection]: (v) => GetSelectionParamsSchema.parse(v ?? {}),
  [Methods.UiShowDiff]: (v) => UiShowDiffParamsSchema.parse(v),
  [Methods.DiagnosticsGetProblems]: (v) => GetProblemsParamsSchema.parse(v ?? {}),
  [Methods.PermissionRequest]: (v) => PermissionRequestParamsSchema.parse(v ?? {}),
  [Methods.WorkspaceReadFile]: (v) => ReadFileParamsSchema.parse(v),
  [Methods.WorkspaceApplyEdit]: (v) => ApplyEditParamsSchema.parse(v),
  [Methods.WorkspaceSaveDocument]: (v) => SaveDocumentParamsSchema.parse(v),
  [Methods.TerminalCreate]: (v) => TerminalCreateParamsSchema.parse(v ?? {}),
  [Methods.TerminalSendText]: (v) => TerminalSendTextParamsSchema.parse(v),
};

export interface DispatcherDeps {
  adapter: EditorAdapter;
  workspaceRoot: string;
  allowOutsideRoot: boolean;
}

export interface Dispatcher {
  handle: (req: JsonRpcRequest) => Promise<JsonRpcResponse>;
  registerHandler: (method: string, handler: MethodHandler) => void;
  hasMethod: (method: string) => boolean;
  /** Read-only methods currently registered (for allowlist checks in tests). */
  readonly registeredMethods: string[];
}

// Build handlers bound to an adapter. Read-only methods are registered here; later phases
// register gated write/terminal/permission handlers via registerHandler.
export function createDispatcher(deps: DispatcherDeps): Dispatcher {
  const handlers: Record<string, MethodHandler> = {
    [Methods.EditorGetActiveEditor]: async () => {
      const r = await deps.adapter.getActiveEditor();
      if (!r) throw vchbThrow(NO_ACTIVE_EDITOR, "No active text editor");
      return r;
    },
    [Methods.EditorGetSelection]: async () => {
      const r = await deps.adapter.getSelection();
      if (!r) throw vchbThrow(NO_ACTIVE_EDITOR, "No active text editor");
      return r;
    },
    [Methods.UiShowDiff]: async (params) => deps.adapter.showDiff(params as UiShowDiffParams),
    [Methods.DiagnosticsGetProblems]: async (params) => deps.adapter.getProblems(params as GetProblemsParams),
    [Methods.PermissionRequest]: async (params) => {
      const p = params as PermissionRequestParams;
      const outcome = await deps.adapter.requestPermission(p.method, p.description);
      if (outcome === "deny") throw vchbThrow(-32004, "Permission denied by user");
      return { outcome };
    },
    [Methods.WorkspaceReadFile]: async (params) => deps.adapter.readFile((params as ReadFileParams).path),
    [Methods.WorkspaceApplyEdit]: async (params) => deps.adapter.applyEdit(params as ApplyEditParams),
    [Methods.WorkspaceSaveDocument]: async (params) => deps.adapter.saveDocument((params as SaveDocumentParams).path),
    [Methods.TerminalCreate]: async (params) => deps.adapter.terminalCreate(params as TerminalCreateParams),
    [Methods.TerminalSendText]: async (params) => deps.adapter.terminalSendText(params as TerminalSendTextParams),
  };

  return {
    async handle(req: JsonRpcRequest): Promise<JsonRpcResponse> {
      if (!req || typeof req.method !== "string") {
        return errorResponse(req?.id ?? null, INVALID_REQUEST, "Invalid Request");
      }
      const handler = handlers[req.method];
      if (!handler) {
        return errorResponse(req.id, METHOD_NOT_FOUND, `Method not found: ${req.method}`);
      }
      try {
        const validate = PARAM_SCHEMAS[req.method];
        const params = validate ? validate(req.params) : req.params;
        const result = await handler(params);
        return { jsonrpc: "2.0", id: req.id, result };
      } catch (e) {
        if (e instanceof ZodError) {
          return errorResponse(req.id, INVALID_PARAMS, e.message);
        }
        if (e instanceof VchbError) {
          return errorResponse(req.id, e.code, e.message);
        }
        const message = e instanceof Error ? e.message || "Internal error" : "Internal error";
        return errorResponse(req.id, INTERNAL_ERROR, message);
      }
    },
    registerHandler(method, handler) {
      handlers[method] = handler;
    },
    hasMethod(method) {
      return method in handlers;
    },
    get registeredMethods() {
      return Object.keys(handlers);
    },
  };
}

function errorResponse(id: number | string | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// A typed error carrying a JSON-RPC code; caught by handle().
export class VchbError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
    this.name = "VchbError";
  }
}

// Throw a VchbError (code + message); caught by handle().
export function vchbThrow(code: number, message: string): never {
  throw new VchbError(code, message);
}
