import { IUserRepository } from '../../domain/repositories/IUserRepository';
import bcrypt from 'bcryptjs';
import { hashResetPasswordToken } from './resetPasswordToken';

export class ResetPassword {
    constructor(private userRepository: IUserRepository) { }

    async execute(token: string, newPasswordPlain: string, confirmPasswordPlain: string): Promise<{ message: string }> {
        if (newPasswordPlain !== confirmPasswordPlain) {
            throw new Error('Passwords do not match');
        }

        const tokenHash = hashResetPasswordToken(token);
        const user = await this.userRepository.findByResetPasswordToken(tokenHash);
        if (!user || !user.resetPasswordExpiresAt || new Date() > user.resetPasswordExpiresAt) {
            throw new Error('Invalid or expired reset token');
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPasswordPlain, salt);
        await this.userRepository.updatePassword(user.id, passwordHash);

        return { message: 'Password has been reset successfully' };
    }
}