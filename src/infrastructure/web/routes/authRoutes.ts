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

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

export { router as authRoutes };