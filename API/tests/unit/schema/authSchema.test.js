import { describe, it, expect } from "@jest/globals";
import { AuthIdSchema } from "../../../schema/authSchema.js";

describe("AuthIdSchema", () => {
  it("accepts a valid UUID", () => {
    const result = AuthIdSchema.safeParse({ sub: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
    expect(result.success).toBe(true);
  });

  it("rejects missing sub field", () => {
    const result = AuthIdSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID string", () => {
    const result = AuthIdSchema.safeParse({ sub: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects numeric sub", () => {
    const result = AuthIdSchema.safeParse({ sub: 12345 });
    expect(result.success).toBe(false);
  });

  it("rejects empty string sub", () => {
    const result = AuthIdSchema.safeParse({ sub: "" });
    expect(result.success).toBe(false);
  });
});
