import { User } from '../entities/User';

export interface IUserRepository {
    findByEmail(email: string): Promise<User | null>;
    create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
}
