import { ResetPassword } from '../../../../src/use-cases/auth/ResetPassword';
import { IUserRepository } from '../../../../src/domain/repositories/IUserRepository';
import bcrypt from 'bcryptjs';

jest.mock('bcryptjs', () => ({
    genSalt: jest.fn().mockResolvedValue('salt'),
    hash: jest.fn().mockResolvedValue('new-hash'),
}));

describe('ResetPassword Use Case', () => {
    let resetPassword: ResetPassword;
    let mockUserRepository: jest.Mocked<IUserRepository>;

    const userWithToken = {
        id: 7,
        email: 'user@example.com',
        passwordHash: 'old-hash',
        isVerified: true,
        resetPasswordToken: 'stored-sha256-hash',
        resetPasswordExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(() => {
        mockUserRepository = {
            findById: jest.fn(),
            findByEmail: jest.fn(),
            findAll: jest.fn(),
            create: jest.fn(),
            updateVerificationCode: jest.fn(),
            markEmailVerified: jest.fn(),
            updateResetPasswordToken: jest.fn(),
            findByResetPasswordToken: jest.fn(),
            updatePassword: jest.fn()
        } as unknown as jest.Mocked<IUserRepository>;

        (bcrypt.hash as jest.Mock).mockClear();

        resetPassword = new ResetPassword(mockUserRepository);
    });

    it('should throw when the passwords do not match', async () => {
        await expect(resetPassword.execute('token', 'newpass123', 'different123'))
            .rejects.toThrow('Passwords do not match');
        expect(mockUserRepository.findByResetPasswordToken).not.toHaveBeenCalled();
    });

    it('should throw when the token is not found', async () => {
        mockUserRepository.findByResetPasswordToken.mockResolvedValue(null);

        await expect(resetPassword.execute('bad-token', 'newpass123', 'newpass123'))
            .rejects.toThrow('Invalid or expired reset token');
        expect(mockUserRepository.updatePassword).not.toHaveBeenCalled();
    });

    it('should throw when the token has expired', async () => {
        mockUserRepository.findByResetPasswordToken.mockResolvedValue({
            ...userWithToken,
            resetPasswordExpiresAt: new Date(Date.now() - 1000),
        });

        await expect(resetPassword.execute('expired-token', 'newpass123', 'newpass123'))
            .rejects.toThrow('Invalid or expired reset token');
        expect(mockUserRepository.updatePassword).not.toHaveBeenCalled();
    });

    it('should hash the new password, save it, and clear the reset token', async () => {
        mockUserRepository.findByResetPasswordToken.mockResolvedValue(userWithToken);

        const result = await resetPassword.execute('valid-token', 'newpass123', 'newpass123');

        expect(bcrypt.hash).toHaveBeenCalledWith('newpass123', 'salt');
        expect(mockUserRepository.updatePassword).toHaveBeenCalledWith(7, 'new-hash');
        expect(result.message).toBe('Password has been reset successfully');
    });
});