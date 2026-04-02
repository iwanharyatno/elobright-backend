import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    PORT: z.string().default('3000'),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(10),
    TIME_ZONE: z.string().default('Asia/Jakarta'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error('Invalid environment variables', _env.error.format());
    process.exit(1);
}

export const env = _env.data;
