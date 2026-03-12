import { Router } from 'express';
import { ExamSectionController } from '../../../interface-adapters/controllers/ExamSectionController';
import { ManageExamSections } from '../../../use-cases/exam/ManageExamSections';
import { DrizzleExamSectionRepository } from '../../../interface-adapters/repositories/DrizzleExamSectionRepository';

const router = Router();

const sectionRepository = new DrizzleExamSectionRepository();
const manageExamSections = new ManageExamSections(sectionRepository);
const sectionController = new ExamSectionController(manageExamSections);

router.post('/', sectionController.create);
router.get('/exam/:examId', sectionController.getByExamId);
router.get('/:id', sectionController.getById);
router.patch('/:id', sectionController.update);
router.patch('/:id/reorder', sectionController.reorder);
router.delete('/:id', sectionController.delete);

export { router as examSectionRoutes };
