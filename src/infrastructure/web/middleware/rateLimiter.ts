import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import Redis from 'ioredis';
import { env } from '../../../config/env';

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
    keyGenerator: (req, res) => req.ip || res.locals?.ip || 'unknown',
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