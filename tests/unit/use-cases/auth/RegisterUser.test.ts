import { RegisterUser } from '../../../../src/use-cases/auth/RegisterUser';
import { IUserRepository } from '../../../../src/domain/repositories/IUserRepository';
import bcrypt from 'bcryptjs';

jest.mock('bcryptjs');

describe('RegisterUser Use Case', () => {
    let registerUser: RegisterUser;
    let mockUserRepository: jest.Mocked<IUserRepository>;

    beforeEach(() => {
        mockUserRepository = {
            findByEmail: jest.fn(),
            create: jest.fn()
        } as unknown as jest.Mocked<IUserRepository>;

        registerUser = new RegisterUser(mockUserRepository);
    });

    it('should successfully register a new user', async () => {
        mockUserRepository.findByEmail.mockResolvedValue(null);
        (bcrypt.genSalt as jest.Mock).mockResolvedValue('randomsalt');
        (bcrypt.hash as jest.Mock).mockResolvedValue('hashedpassword');

        const mockCreatedUser = {
            id: 1,
            fullName: 'Test User',
            email: 'test@example.com',
            passwordHash: 'hashedpassword',
            phoneNumber: '08123456789',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockUserRepository.create.mockResolvedValue(mockCreatedUser);

        const result = await registerUser.execute('test@example.com', 'password123', 'Test User', '08123456789');

        expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
        expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
        expect(bcrypt.hash).toHaveBeenCalledWith('password123', 'randomsalt');
        expect(mockUserRepository.create).toHaveBeenCalledWith({ email: 'test@example.com', fullName: 'Test User', phoneNumber: '08123456789', passwordHash: 'hashedpassword' });

        expect(result).toHaveProperty('id', 1);
        expect(result).toHaveProperty('email', 'test@example.com');
        expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw an error if email is already in use', async () => {
        const mockExistingUser = {
            id: 1,
            fullName: 'Test User',
            email: 'test@example.com',
            passwordHash: 'hashedpassword',
            phoneNumber: '08123456789',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockUserRepository.findByEmail.mockResolvedValue(mockExistingUser);

        await expect(registerUser.execute('test@example.com', 'password123', 'Test User', '08123456789')).rejects.toThrow('Email already in use');
    });
});
