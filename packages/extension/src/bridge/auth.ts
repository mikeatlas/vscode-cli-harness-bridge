import { timingSafeEqual } from "node:crypto";

// Constant-time string comparison for bearer token checks.
export function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Compare to avoid timing leaks on length difference.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function extractBearer(authHeader: string | undefined | null): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  return m ? m[1].trim() : null;
}

export function isAuthorized(authHeader: string | undefined | null, expectedToken: string): boolean {
  const provided = extractBearer(authHeader);
  if (!provided) return false;
  return tokensEqual(provided, expectedToken);
}
