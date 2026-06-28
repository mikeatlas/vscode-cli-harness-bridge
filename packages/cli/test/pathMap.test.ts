import { describe, it, expect } from "vitest";
import { loadPathMap } from "../src/pathMap";

describe("pathMap", () => {
  it("is identity when VCHB_PATH_MAP is unset", () => {
    const m = loadPathMap({});
    expect(m.isIdentity).toBe(true);
    expect(m.mapToHost("/work/src/foo.ts")).toBe("/work/src/foo.ts");
    expect(m.mapFromHost("/host/x")).toBe("/host/x");
  });

  it("rewrites container -> host when VCHB_PATH_MAP is set", () => {
    const m = loadPathMap({ VCHB_PATH_MAP: "/work=/Users/mike/src/proj" });
    expect(m.isIdentity).toBe(false);
    expect(m.mapToHost("/work/src/foo.ts")).toBe("/Users/mike/src/proj/src/foo.ts");
    expect(m.mapFromHost("/Users/mike/src/proj/src/foo.ts")).toBe("/work/src/foo.ts");
  });

  it("leaves unmatched paths unchanged", () => {
    const m = loadPathMap({ VCHB_PATH_MAP: "/work=/Users/mike/src/proj" });
    expect(m.mapToHost("/etc/passwd")).toBe("/etc/passwd");
  });

  it("falls back to identity for malformed map", () => {
    const m = loadPathMap({ VCHB_PATH_MAP: "garbage" });
    expect(m.isIdentity).toBe(true);
  });
});
