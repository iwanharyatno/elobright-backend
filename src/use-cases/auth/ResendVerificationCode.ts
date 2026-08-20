import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IEmailService } from '../../domain/repositories/IEmailService';
import { generateVerificationCode, getVerificationCodeExpiry } from './verificationCode';

export class ResendVerificationCode {
    constructor(
        private userRepository: IUserRepository,
        private emailService: IEmailService
    ) { }

    async execute(email: string): Promise<{ alreadyVerified: boolean }> {
        const user = await this.userRepository.findByEmail(email);
        if (!user) {
            throw new Error('User not found');
        }

        if (user.isVerified) {
            return { alreadyVerified: true };
        }

        const code = generateVerificationCode();
        const expiresAt = getVerificationCodeExpiry();
        await this.userRepository.updateVerificationCode(user.id, code, expiresAt);
        await this.emailService.sendVerificationCode(user.email, code, user.fullName || undefined);

        return { alreadyVerified: false };
    }
}