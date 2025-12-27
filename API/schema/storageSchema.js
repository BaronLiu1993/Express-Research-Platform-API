import { z } from "zod";

export const BodySchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((v) => !v.includes("/") && !v.includes("\\"), {
      message: "Invalid fileName.",
    }),
  fileType: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((v) => !v.includes("/") && !v.includes("\\"), {
      message: "Invalid fileName.",
    }),
});

export const DeleteFileParamsSchema = z.object({
  fileType: z.enum(["resume", "transcript"]),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((v) => !v.includes("/") && !v.includes("\\"), {
      message: "Invalid fileName.",
    }),
});
