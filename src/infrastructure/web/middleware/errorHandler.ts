import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../../logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof ZodError) {
        return res.status(400).json({
            error: 'Validation Error',
            details: err.issues,
        });
    }

    if (err.message === 'Email already in use') {
        return res.status(409).json({ error: err.message });
    }

    if (err.message === 'Invalid email or password') {
        return res.status(401).json({ error: err.message });
    }

    if (err.message === 'Email not verified') {
        return res.status(403).json({ error: err.message });
    }

    if (err.message === 'User not found') {
        return res.status(404).json({ error: err.message });
    }

    if (err.message === 'Invalid verification code' || err.message === 'Verification code has expired') {
        return res.status(400).json({ error: err.message });
    }

    if (err.message === 'SMTP is not configured') {
        return res.status(503).json({ error: err.message });
    }

    if (err.message === 'Passwords do not match' || err.message === 'Invalid or expired reset token') {
        return res.status(400).json({ error: err.message });
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large (max 5MB)' });
    }

    if (err.message === 'Invalid file type: only xlsx, xls, csv allowed') {
        return res.status(400).json({ error: err.message });
    }

    if (err.message === 'NIM column is required' || err.message === 'Exam not found') {
        return res.status(400).json({ error: err.message });
    }

    if (err.message === 'Import already in progress for this exam') {
        return res.status(409).json({ error: err.message });
    }

    if (err.message?.startsWith('Unknown additional score name') || err.message?.startsWith('Unknown section name')) {
        return res.status(400).json({ error: err.message });
    }

    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, {
        errorMessage: err?.message,
        stack: err?.stack,
    });

    res.status(500).json({ error: 'Internal Server Error' });
};