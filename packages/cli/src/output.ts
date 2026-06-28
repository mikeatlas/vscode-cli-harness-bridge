import { BridgeClientError, exitCodeForError } from "./client";
import { DiscoveryError } from "./discovery";

// Print compact JSON to stdout; human-readable errors to stderr. Exit codes carry meaning.
export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value) + "\n");
}

export function fail(err: unknown): never {
  if (err instanceof BridgeClientError) {
    process.stderr.write(`vchb: ${err.codeName}: ${err.message}\n`);
    process.exit(exitCodeForError(err));
  }
  if (err instanceof DiscoveryError) {
    process.stderr.write(`vchb: ${err.codeName}: ${err.message}\n`);
    if (err.candidates && err.candidates.length > 0) {
      process.stderr.write("Candidate sessions:\n");
      for (const c of err.candidates) {
        process.stderr.write(`  - ${c.workspace}  ${c.bridge}  (pid ${c.pid})\n`);
      }
    }
    process.exit(err.codeName === "BRIDGE_UNAVAILABLE" ? 4 : 7);
  }
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`vchb: error: ${msg}\n`);
  process.exit(1);
}
