import { describe, it, expect } from "vitest";
import { assertPathWithinRoot, isPathWithinRoot } from "../src/bridge/pathGuard";
import { VchbError } from "../src/bridge/dispatcher";

describe("pathGuard", () => {
  const root = "/repo";

  it("allows paths inside the root", () => {
    expect(isPathWithinRoot("/repo/src/foo.ts", root)).toBe(true);
    expect(isPathWithinRoot("/repo", root)).toBe(true);
  });

  it("rejects path traversal above the root", () => {
    expect(isPathWithinRoot("/etc/passwd", root)).toBe(false);
    expect(isPathWithinRoot("/repo/../etc/passwd", root)).toBe(false);
  });

  it("allows outside when allowOutsideRoot is set", () => {
    expect(isPathWithinRoot("/etc/passwd", root, true)).toBe(true);
  });
  it("assertPathWithinRoot throws a VchbError with FORBIDDEN_PATH code", () => {
    let caught: unknown;
    try {
      assertPathWithinRoot("/etc/passwd", root);
    } catch (e) {
      caught = e;
    }
    if (!(caught instanceof VchbError)) throw new Error("expected VchbError");
    expect(caught.code).toBe(-32002);
  });
});
