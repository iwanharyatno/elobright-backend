import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User } from '../../domain/entities/User';

export class VerifyEmail {
    constructor(private userRepository: IUserRepository) { }

    async execute(email: string, code: string): Promise<{ alreadyVerified: boolean; user?: User }> {
        const user = await this.userRepository.findByEmail(email);
        if (!user) {
            throw new Error('User not found');
        }

        if (user.isVerified) {
            return { alreadyVerified: true };
        }

        if (!user.verificationCode || user.verificationCode !== code) {
            throw new Error('Invalid verification code');
        }

        if (!user.verificationCodeExpiresAt || user.verificationCodeExpiresAt < new Date()) {
            throw new Error('Verification code has expired');
        }

        const updatedUser = await this.userRepository.markEmailVerified(user.id);
        return { alreadyVerified: false, user: updatedUser ?? undefined };
    }
}