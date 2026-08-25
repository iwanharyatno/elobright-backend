import { RequestPasswordReset } from '../../../../src/use-cases/auth/RequestPasswordReset';
import { IUserRepository } from '../../../../src/domain/repositories/IUserRepository';
import { IEmailService } from '../../../../src/domain/repositories/IEmailService';

describe('RequestPasswordReset Use Case', () => {
    let requestPasswordReset: RequestPasswordReset;
    let mockUserRepository: jest.Mocked<IUserRepository>;
    let mockEmailService: jest.Mocked<IEmailService>;

    const verifiedUser = {
        id: 1,
        email: 'user@example.com',
        passwordHash: 'hash',
        fullName: 'John Doe',
        isVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(() => {
        mockUserRepository = {
            findById: jest.fn(),
            findByEmail: jest.fn().mockResolvedValue(null),
            findAll: jest.fn(),
            create: jest.fn(),
            updateVerificationCode: jest.fn(),
            markEmailVerified: jest.fn(),
            updateResetPasswordToken: jest.fn(),
            findByResetPasswordToken: jest.fn(),
            updatePassword: jest.fn()
        } as unknown as jest.Mocked<IUserRepository>;

        mockEmailService = {
            sendVerificationCode: jest.fn(),
            sendCertificateEmail: jest.fn(),
            sendPasswordResetEmail: jest.fn()
        } as unknown as jest.Mocked<IEmailService>;

        requestPasswordReset = new RequestPasswordReset(mockUserRepository, mockEmailService);
    });

    it('should generate a token, store its sha256 hash, and email the reset link', async () => {
        mockUserRepository.findByEmail.mockResolvedValue(verifiedUser);

        const result = await requestPasswordReset.execute('user@example.com');

        expect(mockUserRepository.updateResetPasswordToken).toHaveBeenCalledTimes(1);
        const [userId, tokenHash, expiresAt] = mockUserRepository.updateResetPasswordToken.mock.calls[0];
        expect(userId).toBe(1);
        // sha256 hex of a 32-byte random token is exactly 64 hex chars
        expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
        expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 55 * 60 * 1000);

        expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
        const [to, name, resetUrl] = mockEmailService.sendPasswordResetEmail.mock.calls[0];
        expect(to).toBe('user@example.com');
        expect(name).toBe('John Doe');
        expect(resetUrl).toMatch(/^http:\/\/[^/]+\/reset-password\?token=[0-9a-f]{64}$/);
        // raw token must not equal the stored hash
        const rawToken = resetUrl!.split('token=')[1];
        expect(rawToken).not.toBe(tokenHash);
        expect(result.message).toContain('password reset link has been sent');
    });

    it('should respond silently for an unknown email without sending anything', async () => {
        mockUserRepository.findByEmail.mockResolvedValue(null);

        const result = await requestPasswordReset.execute('ghost@example.com');

        expect(result.message).toContain('password reset link has been sent');
        expect(mockUserRepository.updateResetPasswordToken).not.toHaveBeenCalled();
        expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should respond silently for an unverified user without sending anything', async () => {
        mockUserRepository.findByEmail.mockResolvedValue({ ...verifiedUser, isVerified: false });

        const result = await requestPasswordReset.execute('user@example.com');

        expect(result.message).toContain('password reset link has been sent');
        expect(mockUserRepository.updateResetPasswordToken).not.toHaveBeenCalled();
        expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
});