import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    PORT: z.string().default('3000'),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(10),
    TIME_ZONE: z.string().default('Asia/Jakarta'),
});

const isTest = process.env.NODE_ENV === 'test';
const _env = envSchema.safeParse(process.env);

if (!isTest && !_env.success) {
    console.error('Invalid environment variables', _env.error.format());
    process.exit(1);
}

export const env = _env.success ? _env.data : {
    PORT: '3000',
    DATABASE_URL: 'postgres://dummy:dummy@localhost:5432/dummy',
    JWT_SECRET: 'supersecretjwtkey12345',
    TIME_ZONE: 'Asia/Jakarta'
} as z.infer<typeof envSchema>;
