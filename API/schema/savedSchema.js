import { z } from "zod";

export const ProfessorIdParamSchema = z.object({
  professorId: z.string().min(1),
});

export const ChangeStatusSchema = z.object({
  status: z.string().min(1),
});

export const SaveProfessorSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  url: z.string().optional().default(""),
  lab_url: z.string().optional().default(""),
  research_interests: z.any().optional(),
  labs: z.any().optional(),
  department: z.string().optional().default(""),
  faculty: z.string().optional().default(""),
  school: z.string().optional().default(""),
});

export const SavedPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});
