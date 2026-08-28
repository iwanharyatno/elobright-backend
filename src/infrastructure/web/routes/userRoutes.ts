import { Router } from 'express';
import { UserController } from '../../../interface-adapters/controllers/UserController';
import { ManageUsers } from '../../../use-cases/user/ManageUsers';
import { DrizzleUserRepository } from '../../../interface-adapters/repositories/DrizzleUserRepository';
import { DrizzleStudentRepository } from '../../../interface-adapters/repositories/DrizzleStudentRepository';
import { NodemailerEmailService } from '../../email/mailer';
import { authMiddleware, ROLE_ADMIN } from '../middleware/authMiddleware';

const router = Router();

const userRepository = new DrizzleUserRepository();
const studentRepository = new DrizzleStudentRepository();
const emailService = new NodemailerEmailService();

const manageUsers = new ManageUsers(userRepository, studentRepository, emailService);
const controller = new UserController(manageUsers);

router.get('/', authMiddleware(ROLE_ADMIN), controller.getAll);
router.patch('/:id/password', authMiddleware(ROLE_ADMIN), controller.updatePassword);
router.post('/:id/reset-password', authMiddleware(ROLE_ADMIN), controller.triggerResetPassword);
router.patch('/:id/verify', authMiddleware(ROLE_ADMIN), controller.verifyUser);

export { router as userRoutes };
