import { z } from "zod";

export const SnippetSchema = z.object({
  snippet_html: z.string(),
  snippet_subject: z.string(),
});