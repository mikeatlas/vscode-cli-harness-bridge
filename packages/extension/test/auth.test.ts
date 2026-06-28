import { describe, it, expect } from "vitest";
import { extractBearer, isAuthorized, tokensEqual } from "../src/bridge/auth";

describe("auth", () => {
  it("extracts a bearer token", () => {
    expect(extractBearer("Bearer abc123")).toBe("abc123");
    expect(extractBearer("bearer  xyz")).toBe("xyz");
    expect(extractBearer("Basic abc")).toBeNull();
    expect(extractBearer(undefined)).toBeNull();
  });

  it("compares tokens in constant time and correctly", () => {
    expect(tokensEqual("abc", "abc")).toBe(true);
    expect(tokensEqual("abc", "abd")).toBe(false);
    expect(tokensEqual("abc", "abcd")).toBe(false);
  });

  it("authorizes a correct bearer header", () => {
    expect(isAuthorized("Bearer secret", "secret")).toBe(true);
    expect(isAuthorized("Bearer wrong", "secret")).toBe(false);
    expect(isAuthorized(undefined, "secret")).toBe(false);
  });
});
