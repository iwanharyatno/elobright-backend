import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ManageUsers } from '../../use-cases/user/ManageUsers';

const getAllQuerySchema = z.object({
    search: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    // alternative names for register date filter
    createdAtFrom: z.string().optional(),
    createdAtTo: z.string().optional(),
});

const updatePasswordSchema = z.object({
    newPassword: z.string().min(6),
    confirmPassword: z.string().min(6).optional(),
}).refine(data => !data.confirmPassword || data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});

const verifySchema = z.object({
    isVerified: z.boolean(),
});

export class UserController {
    constructor(private manageUsers: ManageUsers) {}

    getAll = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = getAllQuerySchema.parse(req.query);
            const search = parsed.search?.trim() || undefined;
            const rawStart = parsed.startDate || parsed.createdAtFrom;
            const rawEnd = parsed.endDate || parsed.createdAtTo;
            let startDate: Date | undefined;
            let endDate: Date | undefined;
            if (rawStart) {
                const d = new Date(rawStart);
                if (isNaN(d.getTime())) throw new Error('Invalid startDate');
                startDate = d;
            }
            if (rawEnd) {
                const d = new Date(rawEnd);
                if (isNaN(d.getTime())) throw new Error('Invalid endDate');
                // Include entire day
                d.setHours(23, 59, 59, 999);
                endDate = d;
            }
            const users = await this.manageUsers.getAll({ search, startDate, endDate });
            // Omit passwordHash
            const sanitized = users.map(({ passwordHash, ...rest }) => rest);
            res.status(200).json(sanitized);
        } catch (error) {
            next(error);
        }
    };

    updatePassword = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const userId = Number(req.params.id);
            if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user id' });
            const data = updatePasswordSchema.parse(req.body);
            const updated = await this.manageUsers.updatePassword(userId, data.newPassword);
            const { passwordHash, ...rest } = updated as any;
            res.status(200).json({ message: 'Password updated successfully', user: rest });
        } catch (error: any) {
            if (error.message === 'User not found') return res.status(404).json({ error: error.message });
            if (error.message === 'Password must be at least 6 characters' || error.message === 'Passwords do not match') {
                return res.status(400).json({ error: error.message });
            }
            next(error);
        }
    };

    triggerResetPassword = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const userId = Number(req.params.id);
            if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user id' });
            const result = await this.manageUsers.triggerResetPassword(userId);
            res.status(200).json(result);
        } catch (error: any) {
            if (error.message === 'User not found') return res.status(404).json({ error: error.message });
            next(error);
        }
    };

    verifyUser = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const userId = Number(req.params.id);
            if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user id' });
            // Allow body { isVerified: boolean } or no body (defaults to true)
            let isVerified = true;
            if (req.body && Object.keys(req.body).length > 0) {
                const parsed = verifySchema.parse(req.body);
                isVerified = parsed.isVerified;
            }
            const updated = await this.manageUsers.setVerified(userId, isVerified);
            const { passwordHash, ...rest } = updated as any;
            res.status(200).json({ message: `User ${isVerified ? 'verified' : 'unverified'} successfully`, user: rest });
        } catch (error: any) {
            if (error.message === 'User not found') return res.status(404).json({ error: error.message });
            next(error);
        }
    };
}
