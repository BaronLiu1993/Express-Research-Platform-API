import { z } from "zod";

export const ThreadIdSchema = z.object({
  threadId: z.string().min(1),
});

export const PageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

export const GetEmailQuerySchema = z.object({
  messageId: z.string().min(1),
  fromUser: z.string().optional(),
});
