import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  ENFORCEMENT_SECRET: z.string().default('dev-enforcement-secret'),
  LLM_PROVIDER: z.enum(['mock', 'gemini', 'hosted', 'evon']).default('mock'),
  LLM_TIMEOUT_MS: z.coerce.number().default(15000),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  EVON_API_KEY: z.string().optional(),
  EVON_API_URL: z.string().optional(),
  HOSTED_LLM_API_KEY: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Environment validation error:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

