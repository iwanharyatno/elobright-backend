import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IStudentRepository } from '../../domain/repositories/IStudentRepository';
import { IEmailService } from '../../domain/repositories/IEmailService';
import { env } from '../../config/env';
import { generateResetPasswordToken, hashResetPasswordToken, getPasswordResetTokenExpiry } from '../auth/resetPasswordToken';
import bcrypt from 'bcryptjs';
import { User } from '../../domain/entities/User';
import { Student } from '../../domain/entities/Student';

export interface UserWithStudent extends User {
    student?: Student | null;
}

export class ManageUsers {
    constructor(
        private userRepository: IUserRepository,
        private studentRepository: IStudentRepository,
        private emailService: IEmailService
    ) {}

    async getAll(filters: { search?: string; startDate?: Date; endDate?: Date }): Promise<UserWithStudent[]> {
        const users = await this.userRepository.findAllWithFilters(filters);
        const students = await this.studentRepository.findAll();
        const studentByUserId = new Map<number, Student>();
        for (const s of students) {
            studentByUserId.set(s.userId, s);
        }
        return users.map(u => ({
            ...u,
            student: studentByUserId.get(u.id) || null,
        }));
    }

    async updatePassword(userId: number, newPassword: string): Promise<User> {
        const user = await this.userRepository.findById(userId);
        if (!user) throw new Error('User not found');
        if (newPassword.length < 6) throw new Error('Password must be at least 6 characters');
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);
        const updated = await this.userRepository.updatePassword(userId, hash);
        if (!updated) throw new Error('User not found');
        return updated;
    }

    async triggerResetPassword(userId: number): Promise<{ message: string }> {
        const user = await this.userRepository.findById(userId);
        if (!user) throw new Error('User not found');
        const token = generateResetPasswordToken();
        const expiresAt = getPasswordResetTokenExpiry();
        await this.userRepository.updateResetPasswordToken(userId, hashResetPasswordToken(token), expiresAt);
        const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;
        await this.emailService.sendPasswordResetEmail(user.email, user.fullName || undefined, resetUrl);
        return { message: 'Password reset email sent' };
    }

    async verifyUser(userId: number): Promise<User> {
        const user = await this.userRepository.findById(userId);
        if (!user) throw new Error('User not found');
        if (user.isVerified) return user;
        const updated = await this.userRepository.setVerified(userId, true);
        if (!updated) throw new Error('User not found');
        return updated;
    }

    async setVerified(userId: number, isVerified: boolean): Promise<User> {
        const user = await this.userRepository.findById(userId);
        if (!user) throw new Error('User not found');
        const updated = await this.userRepository.setVerified(userId, isVerified);
        if (!updated) throw new Error('User not found');
        return updated;
    }
}
