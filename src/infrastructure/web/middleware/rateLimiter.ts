import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
    windowMs?: number;
    max?: number;
    message?: string;
    statusCode?: number;
    keyGenerator?: (req: Request) => string;
}

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const hits = new Map<string, RateLimitEntry>();

export const rateLimit = (options: RateLimitOptions = {}) => {
    const windowMs = options.windowMs ?? 60_000;
    const max = options.max ?? 100;
    const statusCode = options.statusCode ?? 429;
    const message = options.message ?? 'Too many requests, please try again later.';
    const keyGenerator = options.keyGenerator ?? ((req: Request) => req.ip || 'unknown');
    const instanceId = Math.random().toString(36).slice(2);

    return (req: Request, res: Response, next: NextFunction): void => {
        const key = `${instanceId}:${keyGenerator(req)}`;
        const now = Date.now();

        const entry = hits.get(key);
        if (!entry || entry.resetAt <= now) {
            hits.set(key, { count: 1, resetAt: now + windowMs });
            next();
            return;
        }

        entry.count += 1;
        if (entry.count > max) {
            res.status(statusCode).json({ error: message });
            return;
        }

        next();
    };
};