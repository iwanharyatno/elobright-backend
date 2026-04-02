import { Router } from 'express';
import { QuestionOptionController } from '../../../interface-adapters/controllers/QuestionOptionController';
import { ManageQuestionOptions } from '../../../use-cases/exam/ManageQuestionOptions';
import { DrizzleQuestionOptionRepository } from '../../../interface-adapters/repositories/DrizzleQuestionOptionRepository';

import { authMiddleware, ROLE_ADMIN, ROLE_USER } from '../middleware/authMiddleware';

const router = Router();

const optionRepository = new DrizzleQuestionOptionRepository();
const manageQuestionOptions = new ManageQuestionOptions(optionRepository);
const optionController = new QuestionOptionController(manageQuestionOptions);

router.post('/', authMiddleware(ROLE_ADMIN), optionController.create);
router.get('/question/:questionId', authMiddleware(ROLE_ADMIN), optionController.getByQuestionId);
router.get('/question/:questionId/attempt', authMiddleware(ROLE_USER), optionController.getByQuestionIdForUser);
router.get('/:id', authMiddleware(ROLE_ADMIN), optionController.getById);
router.patch('/:id', authMiddleware(ROLE_ADMIN), optionController.update);
router.delete('/:id', authMiddleware(ROLE_ADMIN), optionController.delete);

export { router as questionOptionRoutes };
