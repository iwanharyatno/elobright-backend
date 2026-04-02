import { Request, Response, NextFunction } from 'express';
import { RegisterUser } from '../../use-cases/auth/RegisterUser';
import { LoginUser } from '../../use-cases/auth/LoginUser';
import { z } from 'zod';

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    full_name: z.string(),
    phone_number: z.string(),
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
            const { email, password, full_name, phone_number } = registerSchema.parse(req.body);
            const user = await this.registerUserUseCase.execute(email, password, full_name, phone_number);
            res.status(201).json({ message: 'User registered successfully', user });
        } catch (error) {
            next(error);
        }
    };

    login = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email, password } = loginSchema.parse(req.body);
            const { token } = await this.loginUserUseCase.execute(email, password);
            res.status(200).json({ message: 'Login successful', token });
        } catch (error) {
            next(error);
        }
    };
}
