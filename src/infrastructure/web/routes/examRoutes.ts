import { Router } from 'express';
import { ExamController } from '../../../interface-adapters/controllers/ExamController';
import { ManageExams } from '../../../use-cases/exam/ManageExams';
import { DrizzleExamRepository } from '../../../interface-adapters/repositories/DrizzleExamRepository';

import { authMiddleware, ROLE_ADMIN, ROLE_USER } from '../middleware/authMiddleware';

const router = Router();

const examRepository = new DrizzleExamRepository();
const manageExams = new ManageExams(examRepository);
const examController = new ExamController(manageExams);

router.post('/', authMiddleware(ROLE_ADMIN), examController.create);
router.get('/', examController.getAll);
router.get('/:id', authMiddleware(ROLE_USER), examController.getById);
router.patch('/:id', authMiddleware(ROLE_ADMIN), examController.update);
router.delete('/:id', authMiddleware(ROLE_ADMIN), examController.delete);

export { router as examRoutes };
