import { Router } from 'express';
import { QuestionController } from '../../../interface-adapters/controllers/QuestionController';
import { ManageQuestions } from '../../../use-cases/exam/ManageQuestions';
import { DrizzleQuestionRepository } from '../../../interface-adapters/repositories/DrizzleQuestionRepository';
import { uploadMiddleware } from '../middleware/uploadMiddleware';

const router = Router();

const questionRepository = new DrizzleQuestionRepository();
const manageQuestions = new ManageQuestions(questionRepository);
const questionController = new QuestionController(manageQuestions);

const fileUploads = uploadMiddleware.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'image', maxCount: 1 }
]);

router.post('/', fileUploads, questionController.create);
router.get('/section/:sectionId', questionController.getBySectionId);
router.get('/:id', questionController.getById);
router.patch('/:id', fileUploads, questionController.update);
router.delete('/:id', questionController.delete);

export { router as questionRoutes };
