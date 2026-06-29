import fs from "node:fs";
import { URL } from "node:url";

// Ensure bridge requests bypass the HTTP proxy. In omp-sbx, NODE_USE_ENV_PROXY=1 makes
// fetch() route through gateway.docker.internal:3128 — which intercepts/fails bridge calls
// to host.docker.internal (not in NO_PROXY). This adds the bridge host to NO_PROXY at runtime.
let bypassedHosts: Set<string> | undefined;

export function bypassProxyForHost(host: string): void {
  if (bypassedHosts && bypassedHosts.has(host)) return;
  const current = process.env.NO_PROXY ?? "";
  if (current.split(",").map((h) => h.trim()).includes(host)) return;
  process.env.NO_PROXY = current ? `${current},${host}` : host;
  bypassedHosts ??= new Set<string>();
  bypassedHosts.add(host);
}

export function bypassProxyForUrl(url: string): void {
  try {
    const parsed = new URL(url);
    bypassProxyForHost(parsed.hostname);
  } catch {
    /* not a valid URL; skip */
  }
}

// Detect if we're running inside a Docker container (omp-sbx).
export function isInsideContainer(): boolean {
  if (process.env.WORKSPACE_DIR) return true;
  try {
    fs.accessSync("/.dockerenv");
    return true;
  } catch {
    return false;
  }
}
