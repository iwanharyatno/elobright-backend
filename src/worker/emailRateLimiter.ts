import Redis from 'ioredis';
import { env } from '../config/env';

const KEY = 'email:daily:zset';
const WINDOW_MS = env.EMAIL_JOB_WINDOW_MS;
const EXPIRE_SECONDS = Math.ceil(WINDOW_MS / 1000) + 3600;
const WINDOW_LABEL = WINDOW_MS === 24 * 60 * 60 * 1000 ? '24h rolling' : `${Math.round(WINDOW_MS / 60000)}m rolling`;

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
        return { current, remaining, limit, resetAt, window: WINDOW_LABEL };
    } catch {
        // Redis unavailable — fail open
        const limit = env.EMAIL_JOB_DAILY_LIMIT;
        return { current: 0, remaining: limit, limit, resetAt: Date.now(), window: WINDOW_LABEL };
    }
};

export const checkEmailDailyLimit = async (): Promise<{ allowed: boolean } & RateLimitStatus> => {
    try {
        const status = await getRateLimitStatus();
        return { allowed: status.current < status.limit, ...status };
    } catch {
        const limit = env.EMAIL_JOB_DAILY_LIMIT;
        return { allowed: true, current: 0, remaining: limit, limit, resetAt: Date.now(), window: WINDOW_LABEL };
    }
};

const LUA_TRY_ACQUIRE = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowStart = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local expire = tonumber(ARGV[5])
local windowMs = tonumber(ARGV[6])
redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
local current = redis.call('ZCARD', key)
if current >= limit then
  local earliest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt = now
  if #earliest >= 2 then
    resetAt = tonumber(earliest[2]) + windowMs
  end
  redis.call('EXPIRE', key, expire)
  return {0, current, resetAt}
end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, expire)
return {1, current + 1, 0}
`;

export const tryAcquireEmailSlot = async (jobId?: string): Promise<{ allowed: boolean; current: number; remaining: number; limit: number; resetAt: number; window: string }> => {
    try {
        const now = Date.now();
        const windowStart = now - WINDOW_MS;
        const member = `${now}:${jobId ?? Math.random().toString(36).slice(2, 8)}`;
        const limit = env.EMAIL_JOB_DAILY_LIMIT;
        const result = (await redis.eval(LUA_TRY_ACQUIRE, 1, KEY, now.toString(), windowStart.toString(), limit.toString(), member, EXPIRE_SECONDS.toString(), WINDOW_MS.toString())) as [number, number, number];
        const allowed = result[0] === 1;
        // After tryAcquire, get fresh status for accurate remaining/resetAt
        const status = await getRateLimitStatus();
        return { allowed, current: status.current, remaining: status.remaining, limit: status.limit, resetAt: status.resetAt, window: status.window };
    } catch {
        const limit = env.EMAIL_JOB_DAILY_LIMIT;
        return { allowed: true, current: 0, remaining: limit, limit, resetAt: Date.now(), window: WINDOW_LABEL };
    }
};

export const removeEmailRecord = async (jobId: string): Promise<void> => {
    try {
        // Find and remove the member for this jobId (search by suffix)
        const members = await redis.zrange(KEY, '0', '-1');
        for (const m of members) {
            if (m.endsWith(`:${jobId}`)) {
                await redis.zrem(KEY, m);
                break;
            }
        }
    } catch {}
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
