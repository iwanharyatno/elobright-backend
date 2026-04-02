import { eq } from 'drizzle-orm';
import { db } from '../../infrastructure/database/db';
import { usersTable } from '../../infrastructure/database/schema';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User } from '../../domain/entities/User';

export class DrizzleUserRepository implements IUserRepository {
    async findByEmail(email: string): Promise<User | null> {
        const results = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.email, email))
            .limit(1);

        if (results.length === 0) return null;
        return results[0] as User;
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
            })
            .returning();

        return results[0] as User;
    }
}
