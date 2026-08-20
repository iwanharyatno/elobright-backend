import { Request, Response, NextFunction } from 'express';
import { RegisterUser } from '../../use-cases/auth/RegisterUser';
import { LoginUser } from '../../use-cases/auth/LoginUser';
import { VerifyEmail } from '../../use-cases/auth/VerifyEmail';
import { ResendVerificationCode } from '../../use-cases/auth/ResendVerificationCode';
import { z } from 'zod';

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    full_name: z.string(),
    phone_number: z.string(),
    type: z.enum(['user', 'student']).default('user'),
    student_id: z.string().optional(),
    degree_program: z.string().optional()
}).refine(data => {
    if (data.type === 'student' && !data.student_id) {
        return false;
    }
    return true;
}, {
    message: "student_id is required when type is student",
    path: ["student_id"]
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

const verifyEmailSchema = z.object({
    email: z.string().email(),
    code: z.string().length(6),
});

const resendVerificationSchema = z.object({
    email: z.string().email(),
});

export class AuthController {
    constructor(
        private registerUserUseCase: RegisterUser,
        private loginUserUseCase: LoginUser,
        private verifyEmailUseCase: VerifyEmail,
        private resendVerificationUseCase: ResendVerificationCode
    ) { }

    register = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email, password, full_name, phone_number, type, student_id, degree_program } = registerSchema.parse(req.body);
            const user = await this.registerUserUseCase.execute(email, password, full_name, phone_number, type, student_id, degree_program);
            res.status(201).json({ message: 'User registered successfully. A verification code has been sent to your email.', user });
        } catch (error) {
            next(error);
        }
    };

    login = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email, password } = loginSchema.parse(req.body);
            const { token, user } = await this.loginUserUseCase.execute(email, password);
            res.status(200).json({
                message: 'Login successful', token, user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    phoneNumber: user.phoneNumber,
                    role: user.role,
                    isVerified: user.isVerified,
                }
            });
        } catch (error) {
            next(error);
        }
    };

    verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email, code } = verifyEmailSchema.parse(req.body);
            const { alreadyVerified, user } = await this.verifyEmailUseCase.execute(email, code);
            res.status(200).json({
                message: alreadyVerified ? 'Email is already verified' : 'Email verified successfully',
                user,
            });
        } catch (error) {
            next(error);
        }
    };

    resendVerification = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email } = resendVerificationSchema.parse(req.body);
            const { alreadyVerified } = await this.resendVerificationUseCase.execute(email);
            res.status(200).json({
                message: alreadyVerified ? 'Email is already verified' : 'A new verification code has been sent to your email',
            });
        } catch (error) {
            next(error);
        }
    };
}
