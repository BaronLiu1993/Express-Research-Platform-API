import { describe, it, expect } from "@jest/globals";
import { BodySchema, DeleteFileParamsSchema } from "../../../schema/storageSchema.js";

describe("BodySchema", () => {
  it("accepts valid fileName and fileType", () => {
    const result = BodySchema.safeParse({ fileName: "report", fileType: "resume" });
    expect(result.success).toBe(true);
  });

  it("rejects fileName with forward slash", () => {
    const result = BodySchema.safeParse({ fileName: "a/b", fileType: "resume" });
    expect(result.success).toBe(false);
  });

  it("rejects fileName with backslash", () => {
    const result = BodySchema.safeParse({ fileName: "a\\b", fileType: "resume" });
    expect(result.success).toBe(false);
  });

  it("rejects empty fileName", () => {
    const result = BodySchema.safeParse({ fileName: "", fileType: "resume" });
    expect(result.success).toBe(false);
  });

  it("rejects missing fileType", () => {
    const result = BodySchema.safeParse({ fileName: "report" });
    expect(result.success).toBe(false);
  });

  it("rejects fileName exceeding 255 chars", () => {
    const result = BodySchema.safeParse({ fileName: "a".repeat(256), fileType: "resume" });
    expect(result.success).toBe(false);
  });

  it("rejects fileType with slash", () => {
    const result = BodySchema.safeParse({ fileName: "file", fileType: "re/sume" });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from fileName", () => {
    const result = BodySchema.safeParse({ fileName: "  report  ", fileType: "resume" });
    expect(result.success).toBe(true);
    expect(result.data.fileName).toBe("report");
  });
});

describe("DeleteFileParamsSchema", () => {
  it("accepts resume fileType", () => {
    const result = DeleteFileParamsSchema.safeParse({ fileType: "resume", fileName: "myfile" });
    expect(result.success).toBe(true);
  });

  it("accepts transcript fileType", () => {
    const result = DeleteFileParamsSchema.safeParse({ fileType: "transcript", fileName: "myfile" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid fileType", () => {
    const result = DeleteFileParamsSchema.safeParse({ fileType: "other", fileName: "myfile" });
    expect(result.success).toBe(false);
  });

  it("rejects fileName with path traversal", () => {
    const result = DeleteFileParamsSchema.safeParse({ fileType: "resume", fileName: "../etc" });
    expect(result.success).toBe(false);
  });

  it("rejects empty fileName", () => {
    const result = DeleteFileParamsSchema.safeParse({ fileType: "resume", fileName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing fileName", () => {
    const result = DeleteFileParamsSchema.safeParse({ fileType: "resume" });
    expect(result.success).toBe(false);
  });
});
