import { z } from "zod";

const ProfessorDraftItem = z.object({
  id: z.number(),
  email: z.string().email(),
  name: z.string().min(1),
  dynamicFields: z.any().optional(),
});

const ProfessorSendItem = z.object({
  id: z.union([z.number(), z.string()]),
  professor_id: z.union([z.number(), z.string()]),
  email: z.string().email(),
  name: z.string().min(1),
});

export const CreateDraftSchema = z.object({
  professorData: z.array(ProfessorDraftItem).min(1).max(5),
  baseBody: z.any(),
});

export const CreateVariablelessDraftSchema = z.object({
  html: z.string().min(1),
  subject: z.string().min(1),
  professorData: z.array(ProfessorDraftItem).min(1).max(5),
  baseBody: z.any(),
});

export const SendDraftSchema = z.object({
  userEmail: z.string().email(),
  userName: z.string().min(1),
  professorData: z.array(ProfessorSendItem).min(1).max(5),
  labelId: z.string().min(1),
});

export const SendAttachmentsDraftSchema = z.object({
  userEmail: z.string().email(),
  userName: z.string().min(1),
  professorData: z.array(ProfessorSendItem).min(1).max(5),
  labelId: z.string().min(1),
  sendResume: z.boolean(),
  sendTranscript: z.boolean(),
});

export const DraftIdQuerySchema = z.object({
  draftId: z.string().min(1),
});

export const UpdateDraftBodySchema = z.object({
  to: z.string().email(),
  fromEmail: z.string().email(),
  fromName: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
});
