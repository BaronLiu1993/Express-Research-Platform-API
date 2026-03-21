import { z } from "zod";

export const SendReplyBodySchema = z.object({
  userEmail: z.string().email(),
  userName: z.string().min(1),
  professorEmail: z.string().email(),
  professorName: z.string().min(1),
  body: z.string().min(1),
  subject: z.string().min(1),
  threadId: z.string().min(1),
});

export const ReplyQuerySchema = z.object({
  messageId: z.string().min(1),
});
