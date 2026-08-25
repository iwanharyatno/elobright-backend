import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IEmailService } from '../../domain/repositories/IEmailService';
import { env } from '../../config/env';
import { generateResetPasswordToken, hashResetPasswordToken, getPasswordResetTokenExpiry } from './resetPasswordToken';

export class RequestPasswordReset {
    constructor(
        private userRepository: IUserRepository,
        private emailService: IEmailService
    ) { }

    async execute(email: string): Promise<{ message: string }> {
        const genericMessage = 'If an account with that email exists, a password reset link has been sent.';

        const user = await this.userRepository.findByEmail(email);
        if (!user || !user.isVerified) {
            return { message: genericMessage };
        }

        const token = generateResetPasswordToken();
        const expiresAt = getPasswordResetTokenExpiry();
        await this.userRepository.updateResetPasswordToken(user.id, hashResetPasswordToken(token), expiresAt);

        const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;
        await this.emailService.sendPasswordResetEmail(user.email, user.fullName || undefined, resetUrl);

        return { message: genericMessage };
    }
}