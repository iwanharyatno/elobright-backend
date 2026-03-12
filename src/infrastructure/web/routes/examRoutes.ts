import { Router } from 'express';
import { ExamController } from '../../../interface-adapters/controllers/ExamController';
import { ManageExams } from '../../../use-cases/exam/ManageExams';
import { DrizzleExamRepository } from '../../../interface-adapters/repositories/DrizzleExamRepository';

const router = Router();

const examRepository = new DrizzleExamRepository();
const manageExams = new ManageExams(examRepository);
const examController = new ExamController(manageExams);

router.post('/', examController.create);
router.get('/', examController.getAll);
router.get('/:id', examController.getById);
router.patch('/:id', examController.update);
router.delete('/:id', examController.delete);

export { router as examRoutes };
