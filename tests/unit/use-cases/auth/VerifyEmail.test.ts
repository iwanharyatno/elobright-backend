import { VerifyEmail } from '../../../../src/use-cases/auth/VerifyEmail';
import { IUserRepository } from '../../../../src/domain/repositories/IUserRepository';

describe('VerifyEmail Use Case', () => {
    let verifyEmail: VerifyEmail;
    let mockUserRepository: jest.Mocked<IUserRepository>;

    const baseUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: 'hashedpassword',
        isVerified: false,
        verificationCode: '123456',
        verificationCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(() => {
        mockUserRepository = {
            findByEmail: jest.fn(),
            findAll: jest.fn(),
            create: jest.fn(),
            updateVerificationCode: jest.fn(),
            markEmailVerified: jest.fn()
        } as unknown as jest.Mocked<IUserRepository>;

        verifyEmail = new VerifyEmail(mockUserRepository);
    });

    it('should verify the email with a valid code', async () => {
        mockUserRepository.findByEmail.mockResolvedValue(baseUser);
        mockUserRepository.markEmailVerified.mockResolvedValue({ ...baseUser, isVerified: true });

        const result = await verifyEmail.execute('test@example.com', '123456');

        expect(mockUserRepository.markEmailVerified).toHaveBeenCalledWith(1);
        expect(result).toEqual({ alreadyVerified: false, user: { ...baseUser, isVerified: true } });
    });

    it('should return alreadyVerified when the user is already verified', async () => {
        mockUserRepository.findByEmail.mockResolvedValue({ ...baseUser, isVerified: true });

        const result = await verifyEmail.execute('test@example.com', '123456');

        expect(mockUserRepository.markEmailVerified).not.toHaveBeenCalled();
        expect(result).toEqual({ alreadyVerified: true });
    });

    it('should throw an error when the user is not found', async () => {
        mockUserRepository.findByEmail.mockResolvedValue(null);

        await expect(verifyEmail.execute('nobody@example.com', '123456')).rejects.toThrow('User not found');
    });

    it('should throw an error when the code is invalid', async () => {
        mockUserRepository.findByEmail.mockResolvedValue(baseUser);

        await expect(verifyEmail.execute('test@example.com', '000000')).rejects.toThrow('Invalid verification code');
    });

    it('should throw an error when the code has expired', async () => {
        mockUserRepository.findByEmail.mockResolvedValue({
            ...baseUser,
            verificationCodeExpiresAt: new Date(Date.now() - 1000),
        });

        await expect(verifyEmail.execute('test@example.com', '123456')).rejects.toThrow('Verification code has expired');
    });
});