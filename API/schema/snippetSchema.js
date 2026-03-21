import { z } from "zod";

export const SnippetSchema = z.object({
  snippet_html: z.string(),
  snippet_subject: z.string(),
});

export const SyncVariablesSchema = z.object({
  variableArray: z.array(z.string()).min(1),
  professorIdArray: z.array(z.number()).min(1),
});