import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User } from '../../domain/entities/User';
import bcrypt from 'bcryptjs';

export class RegisterUser {
    constructor(private userRepository: IUserRepository) { }

    async execute(email: string, passwordPlain: string, full_name: string, phone_number: string): Promise<Omit<User, 'passwordHash'>> {
        const existingUser = await this.userRepository.findByEmail(email);
        if (existingUser) {
            throw new Error('Email already in use');
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(passwordPlain, salt);

        const user = await this.userRepository.create({ email, passwordHash, fullName: full_name, phoneNumber: phone_number });

        // Omit password hash in response
        const { passwordHash: _, ...userWithoutPassword } = user;
        return userWithoutPassword as Omit<User, 'passwordHash'>;
    }
}
