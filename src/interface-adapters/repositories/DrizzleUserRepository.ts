import { eq, ilike, or, and, gte, lte } from 'drizzle-orm';
import { db } from '../../infrastructure/database/db';
import { usersTable } from '../../infrastructure/database/schema';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User } from '../../domain/entities/User';

export class DrizzleUserRepository implements IUserRepository {
    async findById(id: number): Promise<User | null> {
        const results = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, id))
            .limit(1);

        if (results.length === 0) return null;
        return results[0] as User;
    }

    async findByEmail(email: string): Promise<User | null> {
        const results = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.email, email))
            .limit(1);

        if (results.length === 0) return null;
        return results[0] as User;
    }

    async findAll(): Promise<User[]> {
        const results = await db.select().from(usersTable);
        return results as User[];
    }

    async findAllWithFilters(filters: { search?: string; startDate?: Date; endDate?: Date }): Promise<User[]> {
        const conditions: any[] = [];
        if (filters.search) {
            const pattern = `%${filters.search}%`;
            conditions.push(or(ilike(usersTable.email, pattern), ilike(usersTable.fullName, pattern)));
        }
        if (filters.startDate) {
            conditions.push(gte(usersTable.createdAt, filters.startDate));
        }
        if (filters.endDate) {
            conditions.push(lte(usersTable.createdAt, filters.endDate));
        }
        if (conditions.length === 0) {
            const results = await db.select().from(usersTable);
            return results as User[];
        }
        const results = await db.select().from(usersTable).where(and(...conditions));
        return results as User[];
    }

    async create(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
        const results = await db
            .insert(usersTable)
            .values({
                email: userData.email,
                passwordHash: userData.passwordHash,
                fullName: userData.fullName,
                role: userData.role || 'user',
                phoneNumber: userData.phoneNumber,
                isVerified: userData.isVerified ?? false,
            })
            .returning();

        return results[0] as User;
    }

    async updateVerificationCode(userId: number, code: string, expiresAt: Date): Promise<User | null> {
        const results = await db
            .update(usersTable)
            .set({
                verificationCode: code,
                verificationCodeExpiresAt: expiresAt,
            })
            .where(eq(usersTable.id, userId))
            .returning();

        if (results.length === 0) return null;
        return results[0] as User;
    }

    async markEmailVerified(userId: number): Promise<User | null> {
        const results = await db
            .update(usersTable)
            .set({
                isVerified: true,
                verificationCode: null,
                verificationCodeExpiresAt: null,
            })
            .where(eq(usersTable.id, userId))
            .returning();

        if (results.length === 0) return null;
        return results[0] as User;
    }

    async setVerified(userId: number, isVerified: boolean): Promise<User | null> {
        const results = await db
            .update(usersTable)
            .set({
                isVerified,
                verificationCode: null,
                verificationCodeExpiresAt: null,
            })
            .where(eq(usersTable.id, userId))
            .returning();

        if (results.length === 0) return null;
        return results[0] as User;
    }

    async updateResetPasswordToken(userId: number, tokenHash: string, expiresAt: Date): Promise<User | null> {
        const results = await db
            .update(usersTable)
            .set({
                resetPasswordToken: tokenHash,
                resetPasswordExpiresAt: expiresAt,
            })
            .where(eq(usersTable.id, userId))
            .returning();

        if (results.length === 0) return null;
        return results[0] as User;
    }

    async findByResetPasswordToken(tokenHash: string): Promise<User | null> {
        const results = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.resetPasswordToken, tokenHash))
            .limit(1);

        if (results.length === 0) return null;
        return results[0] as User;
    }

    async updatePassword(userId: number, passwordHash: string): Promise<User | null> {
        const results = await db
            .update(usersTable)
            .set({
                passwordHash,
                resetPasswordToken: null,
                resetPasswordExpiresAt: null,
            })
            .where(eq(usersTable.id, userId))
            .returning();

        if (results.length === 0) return null;
        return results[0] as User;
    }
}
