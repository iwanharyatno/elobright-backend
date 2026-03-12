import { Router } from 'express';
import { QuestionOptionController } from '../../../interface-adapters/controllers/QuestionOptionController';
import { ManageQuestionOptions } from '../../../use-cases/exam/ManageQuestionOptions';
import { DrizzleQuestionOptionRepository } from '../../../interface-adapters/repositories/DrizzleQuestionOptionRepository';

const router = Router();

const optionRepository = new DrizzleQuestionOptionRepository();
const manageQuestionOptions = new ManageQuestionOptions(optionRepository);
const optionController = new QuestionOptionController(manageQuestionOptions);

router.post('/', optionController.create);
router.get('/question/:questionId', optionController.getByQuestionId);
router.get('/:id', optionController.getById);
router.patch('/:id', optionController.update);
router.delete('/:id', optionController.delete);

export { router as questionOptionRoutes };
