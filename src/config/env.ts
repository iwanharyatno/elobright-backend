import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    PORT: z.string().default('3000'),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(10),
    TIME_ZONE: z.string().default('Asia/Jakarta'),
    SMTP_HOST: z.string().default(''),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().default(''),
    SMTP_PASSWORD: z.string().default(''),
    EMAIL_FROM: z.string().default('Elobright <no-reply@elobright.com>'),
    BASE_URL: z.string().default('http://localhost:3000'),
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string().default(''),
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
    TIME_ZONE: 'Asia/Jakarta',
    SMTP_HOST: '',
    SMTP_PORT: 587,
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    EMAIL_FROM: 'Elobright <no-reply@elobright.com>',
    BASE_URL: 'http://localhost:3000',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: ''
} as z.infer<typeof envSchema>;
