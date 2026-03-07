import { Router } from 'express';
import { AuthController } from '../../../interface-adapters/controllers/AuthController';
import { RegisterUser } from '../../../use-cases/auth/RegisterUser';
import { LoginUser } from '../../../use-cases/auth/LoginUser';
import { DrizzleUserRepository } from '../../../interface-adapters/repositories/DrizzleUserRepository';

const router = Router();

// Dependency Injection Setup
const userRepository = new DrizzleUserRepository();
const registerUser = new RegisterUser(userRepository);
const loginUser = new LoginUser(userRepository);
const authController = new AuthController(registerUser, loginUser);

router.post('/register', authController.register);
router.post('/login', authController.login);

export { router as authRoutes };
