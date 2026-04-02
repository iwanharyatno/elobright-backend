import { Router } from 'express';
import { QuestionController } from '../../../interface-adapters/controllers/QuestionController';
import { ManageQuestions } from '../../../use-cases/exam/ManageQuestions';
import { DrizzleQuestionRepository } from '../../../interface-adapters/repositories/DrizzleQuestionRepository';
import { uploadMiddleware } from '../middleware/uploadMiddleware';

import { authMiddleware, ROLE_ADMIN, ROLE_USER } from '../middleware/authMiddleware';

const router = Router();

const questionRepository = new DrizzleQuestionRepository();
const manageQuestions = new ManageQuestions(questionRepository);
const questionController = new QuestionController(manageQuestions);

const fileUploads = uploadMiddleware.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'image', maxCount: 1 }
]);

router.post('/', authMiddleware(ROLE_ADMIN), fileUploads, questionController.create);
router.get('/section/:sectionId', authMiddleware(ROLE_USER), questionController.getBySectionId);
router.get('/:id', authMiddleware(ROLE_USER), questionController.getById);
router.patch('/:id', authMiddleware(ROLE_ADMIN), fileUploads, questionController.update);
router.delete('/:id', authMiddleware(ROLE_ADMIN), questionController.delete);

export { router as questionRoutes };
