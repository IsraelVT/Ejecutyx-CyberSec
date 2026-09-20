import { z } from "zod";

export const env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
  WEB_ORIGIN: z.string().url(),
  SCAN_MAX_REDIRECTS: z.coerce.number().int().min(0).max(5).default(3),
  SCAN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(20000).default(8000),
}).parse(process.env);
