import { describe, it, expect } from "@jest/globals";
import { SnippetSchema } from "../../../schema/snippetSchema.js";

describe("SnippetSchema", () => {
  it("accepts valid snippet with html and subject", () => {
    const result = SnippetSchema.safeParse({
      snippet_html: "<p>Hello {{name}}</p>",
      snippet_subject: "Research Opportunity",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing snippet_html", () => {
    const result = SnippetSchema.safeParse({ snippet_subject: "Hello" });
    expect(result.success).toBe(false);
  });

  it("rejects missing snippet_subject", () => {
    const result = SnippetSchema.safeParse({ snippet_html: "<p>Hello</p>" });
    expect(result.success).toBe(false);
  });

  it("rejects non-string snippet_html", () => {
    const result = SnippetSchema.safeParse({ snippet_html: 123, snippet_subject: "Hello" });
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = SnippetSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string snippet_subject", () => {
    const result = SnippetSchema.safeParse({ snippet_html: "<p>Hi</p>", snippet_subject: 42 });
    expect(result.success).toBe(false);
  });
});
