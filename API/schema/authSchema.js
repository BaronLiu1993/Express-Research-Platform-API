import { z } from "zod";

export const AuthIdSchema = z.object({
  sub: z.uuid(),
});
