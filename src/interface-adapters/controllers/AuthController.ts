import { Request, Response, NextFunction } from 'express';
import { RegisterUser } from '../../use-cases/auth/RegisterUser';
import { LoginUser } from '../../use-cases/auth/LoginUser';
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

export class AuthController {
    constructor(
        private registerUserUseCase: RegisterUser,
        private loginUserUseCase: LoginUser
    ) { }

    register = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email, password, full_name, phone_number, type, student_id, degree_program } = registerSchema.parse(req.body);
            const user = await this.registerUserUseCase.execute(email, password, full_name, phone_number, type, student_id, degree_program);
            res.status(201).json({ message: 'User registered successfully', user });
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
                }
            });
        } catch (error) {
            next(error);
        }
    };
}
