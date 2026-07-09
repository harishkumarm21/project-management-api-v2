import { z } from "zod";
import { config } from "dotenv";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),

  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
})

export const env = envSchema.parse(process.env)