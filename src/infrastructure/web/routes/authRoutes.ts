import { Router } from 'express';
import { AuthController } from '../../../interface-adapters/controllers/AuthController';
import { RegisterUser } from '../../../use-cases/auth/RegisterUser';
import { LoginUser } from '../../../use-cases/auth/LoginUser';
import { VerifyEmail } from '../../../use-cases/auth/VerifyEmail';
import { ResendVerificationCode } from '../../../use-cases/auth/ResendVerificationCode';
import { RequestPasswordReset } from '../../../use-cases/auth/RequestPasswordReset';
import { ResetPassword } from '../../../use-cases/auth/ResetPassword';
import { DrizzleUserRepository } from '../../../interface-adapters/repositories/DrizzleUserRepository';
import { DrizzleStudentRepository } from '../../../interface-adapters/repositories/DrizzleStudentRepository';
import { NodemailerEmailService } from '../../../infrastructure/email/mailer';
import { rateLimit } from '../middleware/rateLimiter';
import { env } from '../../../config/env';

const router = Router();

// Dependency Injection Setup
const userRepository = new DrizzleUserRepository();
const studentRepository = new DrizzleStudentRepository();
const emailService = new NodemailerEmailService();
const registerUser = new RegisterUser(userRepository, studentRepository, emailService);
const loginUser = new LoginUser(userRepository);
const verifyEmail = new VerifyEmail(userRepository);
const resendVerificationCode = new ResendVerificationCode(userRepository, emailService);
const requestPasswordReset = new RequestPasswordReset(userRepository, emailService);
const resetPassword = new ResetPassword(userRepository);
const authController = new AuthController(
    registerUser,
    loginUser,
    verifyEmail,
    resendVerificationCode,
    requestPasswordReset,
    resetPassword
);

const authRateLimit = rateLimit({ windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS, max: env.RATE_LIMIT_AUTH_MAX, message: 'Too many auth attempts, please try again later.' });
const loginRateLimit = rateLimit({ windowMs: env.RATE_LIMIT_LOGIN_WINDOW_MS, max: env.RATE_LIMIT_LOGIN_MAX, message: 'Too many login attempts, please try again later.' });
const passwordResetRateLimit = rateLimit({ windowMs: env.RATE_LIMIT_PASSWORD_RESET_WINDOW_MS, max: env.RATE_LIMIT_PASSWORD_RESET_MAX, message: 'Too many password reset attempts, please try again later.' });

router.post('/register', authRateLimit, authController.register);
router.post('/login', loginRateLimit, authController.login);
router.post('/verify-email', authRateLimit, authController.verifyEmail);
router.post('/resend-verification', authRateLimit, authController.resendVerification);
router.post('/forgot-password', passwordResetRateLimit, authController.forgotPassword);
router.post('/reset-password', passwordResetRateLimit, authController.resetPassword);

export { router as authRoutes };