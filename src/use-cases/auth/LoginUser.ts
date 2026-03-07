import { IUserRepository } from '../../domain/repositories/IUserRepository';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

export class LoginUser {
    constructor(private userRepository: IUserRepository) { }

    async execute(email: string, passwordPlain: string): Promise<{ token: string }> {
        const user = await this.userRepository.findByEmail(email);
        if (!user) {
            throw new Error('Invalid email or password');
        }

        const isMatch = await bcrypt.compare(passwordPlain, user.passwordHash);
        if (!isMatch) {
            throw new Error('Invalid email or password');
        }

        const token = jwt.sign(
            { userId: user.id },
            env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        return { token };
    }
}
