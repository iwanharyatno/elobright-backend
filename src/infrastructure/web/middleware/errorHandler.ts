import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(err);

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

    res.status(500).json({ error: 'Internal Server Error' });
};
