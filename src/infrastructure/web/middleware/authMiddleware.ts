import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';

export const ROLE_USER = ['user', 'moderator', 'reviewer', 'admin', 'superadmin'];
export const ROLE_ADMIN = ['admin', 'superadmin'];

export interface AuthRequest extends Request {
    user?: {
        userId: number;
        role: string;
    };
}

export const authMiddleware = (allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: number; role: string };
            
            if (!allowedRoles.includes(decoded.role)) {
                res.status(403).json({ error: 'Forbidden' });
                return;
            }

            (req as AuthRequest).user = decoded;
            next();
        } catch (error) {
            res.status(401).json({ error: 'Unauthorized' });
        }
    };
};
