import { Router } from 'express';
import { AuthController } from '../../../interface-adapters/controllers/AuthController';
import { RegisterUser } from '../../../use-cases/auth/RegisterUser';
import { LoginUser } from '../../../use-cases/auth/LoginUser';
import { VerifyEmail } from '../../../use-cases/auth/VerifyEmail';
import { ResendVerificationCode } from '../../../use-cases/auth/ResendVerificationCode';
import { DrizzleUserRepository } from '../../../interface-adapters/repositories/DrizzleUserRepository';
import { DrizzleStudentRepository } from '../../../interface-adapters/repositories/DrizzleStudentRepository';
import { NodemailerEmailService } from '../../../infrastructure/email/mailer';
import { rateLimit } from '../middleware/rateLimiter';

const router = Router();

// Dependency Injection Setup
const userRepository = new DrizzleUserRepository();
const studentRepository = new DrizzleStudentRepository();
const emailService = new NodemailerEmailService();
const registerUser = new RegisterUser(userRepository, studentRepository, emailService);
const loginUser = new LoginUser(userRepository);
const verifyEmail = new VerifyEmail(userRepository);
const resendVerificationCode = new ResendVerificationCode(userRepository, emailService);
const authController = new AuthController(registerUser, loginUser, verifyEmail, resendVerificationCode);

const authRateLimit = rateLimit({ windowMs: 15 * 60_000, max: 20, message: 'Too many auth attempts, please try again later.' });
const loginRateLimit = rateLimit({ windowMs: 15 * 60_000, max: 5, message: 'Too many login attempts, please try again later.' });

router.post('/register', authRateLimit, authController.register);
router.post('/login', loginRateLimit, authController.login);
router.post('/verify-email', authRateLimit, authController.verifyEmail);
router.post('/resend-verification', authRateLimit, authController.resendVerification);

export { router as authRoutes };