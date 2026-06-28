// Custom VCHB error codes in the implementation-defined range (-32000 to -32099).

export const VchbErrorCode = {
  AUTH_REQUIRED: -32001,
  FORBIDDEN_PATH: -32002,
  NO_ACTIVE_EDITOR: -32003,
  PERMISSION_DENIED: -32004,
  METHOD_NOT_ALLOWED: -32005,
  BRIDGE_UNAVAILABLE: -32006,
} as const;

export type VchbErrorName = keyof typeof VchbErrorCode;

export const VchbErrorMessage: Record<VchbErrorName, string> = {
  AUTH_REQUIRED: "Bearer token required or invalid",
  FORBIDDEN_PATH: "Path is outside the workspace scope",
  NO_ACTIVE_EDITOR: "No active text editor",
  PERMISSION_DENIED: "Permission denied by user",
  METHOD_NOT_ALLOWED: "Method is not allowed",
  BRIDGE_UNAVAILABLE: "Bridge is not available",
};

export function vchbError(name: VchbErrorName, data?: unknown) {
  return { code: VchbErrorCode[name], message: VchbErrorMessage[name], data };
}
