import { z } from "zod";

export const AuthIdSchema = z.object({
  sub: z.uuid(),
});

export const OAuthCallbackSchema = z.object({
  code: z.string().min(1, "Code is required"),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const RegisterSchema = z.object({
  student_major: z.string().min(1),
  student_year: z.string().min(1),
  student_interests: z.array(z.string().min(1)).min(1).max(3),
  student_acceptedterms: z.literal(true),
});

export const UpdateProfileSchema = z.object({
  student_major: z.string().min(1),
  student_year: z.string().min(1),
  student_interests: z.array(z.string().min(1)).min(1).max(3),
});

export const WatchQueueSchema = z.object({
  watchData: z.array(z.object({ user_id: z.string().min(1) })),
});
