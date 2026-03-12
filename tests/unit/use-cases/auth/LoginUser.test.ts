import { LoginUser } from '../../../../src/use-cases/auth/LoginUser';
import { IUserRepository } from '../../../../src/domain/repositories/IUserRepository';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../../../src/config/env';

jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

describe('LoginUser Use Case', () => {
    let loginUser: LoginUser;
    let mockUserRepository: jest.Mocked<IUserRepository>;

    beforeEach(() => {
        mockUserRepository = {
            findByEmail: jest.fn(),
            create: jest.fn()
        } as unknown as jest.Mocked<IUserRepository>;

        loginUser = new LoginUser(mockUserRepository);
    });

    it('should successfully login and return a token when credentials are valid', async () => {
        const mockUser = {
            id: 1,
            email: 'test@example.com',
            passwordHash: 'hashedpassword',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockUserRepository.findByEmail.mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        (jwt.sign as jest.Mock).mockReturnValue('mocked-token');
        env.JWT_SECRET = 'secret';

        const result = await loginUser.execute('test@example.com', 'password123');

        expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
        expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedpassword');
        expect(jwt.sign).toHaveBeenCalledWith({ userId: mockUser.id }, 'secret', { expiresIn: '1d' });
        expect(result).toEqual({ token: 'mocked-token' });
    });

    it('should throw an error when user is not found', async () => {
        mockUserRepository.findByEmail.mockResolvedValue(null);

        await expect(loginUser.execute('test@example.com', 'password123')).rejects.toThrow('Invalid email or password');
    });

    it('should throw an error when password does not match', async () => {
        const mockUser = {
            id: 1,
            email: 'test@example.com',
            passwordHash: 'hashedpassword',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockUserRepository.findByEmail.mockResolvedValue(mockUser);
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);

        await expect(loginUser.execute('test@example.com', 'wrongpassword')).rejects.toThrow('Invalid email or password');
    });
});
