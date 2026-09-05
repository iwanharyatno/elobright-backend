import Redis from 'ioredis';
import { env } from '../config/env';

const KEY = 'email:daily:zset';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const EXPIRE_SECONDS = 25 * 60 * 60;

const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    lazyConnect: false,
});

redis.on('error', () => {});

export interface RateLimitStatus {
    current: number;
    remaining: number;
    limit: number;
    resetAt: number;
    window: string;
}

export const getRateLimitStatus = async (): Promise<RateLimitStatus> => {
    try {
        const now = Date.now();
        const windowStart = now - WINDOW_MS;
        const pipeline = redis.pipeline();
        pipeline.zremrangebyscore(KEY, '0', windowStart.toString());
        pipeline.zcard(KEY);
        pipeline.zrange(KEY, '0', '0', 'WITHSCORES');
        const results = await pipeline.exec();
        const current = (results?.[1]?.[1] as number) ?? 0;
        const earliestRaw = results?.[2]?.[1] as any;
        let earliest: number | null = null;
        if (Array.isArray(earliestRaw) && earliestRaw.length >= 2) {
            earliest = Number(earliestRaw[1]);
        } else if (typeof earliestRaw === 'string' && earliestRaw) {
            // fallback if WITHSCORES returns differently
            earliest = Number(earliestRaw);
        }
        const limit = env.EMAIL_JOB_DAILY_LIMIT;
        const remaining = Math.max(0, limit - current);
        const resetAt = earliest ? earliest + WINDOW_MS : now;
        return { current, remaining, limit, resetAt, window: '24h rolling' };
    } catch {
        // Redis unavailable — fail open
        const limit = env.EMAIL_JOB_DAILY_LIMIT;
        return { current: 0, remaining: limit, limit, resetAt: Date.now(), window: '24h rolling' };
    }
};

export const checkEmailDailyLimit = async (): Promise<{ allowed: boolean } & RateLimitStatus> => {
    try {
        const status = await getRateLimitStatus();
        return { allowed: status.current < status.limit, ...status };
    } catch {
        const limit = env.EMAIL_JOB_DAILY_LIMIT;
        return { allowed: true, current: 0, remaining: limit, limit, resetAt: Date.now(), window: '24h rolling' };
    }
};

export const recordEmailSent = async (jobId?: string): Promise<RateLimitStatus> => {
    try {
        const now = Date.now();
        const member = `${now}:${jobId ?? Math.random().toString(36).slice(2, 8)}`;
        await redis.pipeline().zadd(KEY, now.toString(), member).expire(KEY, EXPIRE_SECONDS).exec();
    } catch {}
    return getRateLimitStatus();
};

export const closeEmailRateLimiter = async (): Promise<void> => {
    await redis.quit().catch(() => redis.disconnect());
};
