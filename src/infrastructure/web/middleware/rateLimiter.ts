import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import Redis from 'ioredis';
import type { Request } from 'express';
import { env } from '../../../config/env';

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Resolves the real client IP:
 * 1. req.ip (respects Express `trust proxy`)
 * 2. falls back to X-Forwarded-For (leftmost entry = original client)
 *    when req.ip is a loopback address — e.g. when the app sits
 *    behind an nginx proxy that doesn't feed `trust proxy` correctly.
 */
const getClientIp = (req: Request): string => {
    const reqIp = req.ip || '';

    if (reqIp && !LOOPBACK_IPS.has(reqIp)) {
        return reqIp;
    }

    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
        const candidate = forwarded.split(',')[0].trim();
        if (candidate) return candidate;
    }

    return reqIp || 'unknown';
};

const redisClient = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    lazyConnect: false,
    maxRetriesPerRequest: null,
});

// Never let limiter/redis errors crash the app
redisClient.on('error', () => {
    // connection problems are logged by the store failures below; keep silent here
});

/**
 * Single IP-scoped rate limiter shared by every /api route.
 * Counters live in Redis (prefix `rl:`) so they survive restarts
 * and are consistent across API instances.
 */
export const apiRateLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    message: { error: 'Too many requests, please try again later.' },
    store: new RedisStore({
        sendCommand: async (...args: string[]): Promise<RedisReply> =>
            (redisClient.call as (...args: unknown[]) => Promise<unknown>)(...args) as Promise<RedisReply>,
        prefix: 'rl:',
    }),
});

export const closeRateLimitRedis = async (): Promise<void> => {
    await redisClient.quit().catch(() => redisClient.disconnect());
};