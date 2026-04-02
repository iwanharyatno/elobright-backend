import { Router } from 'express';
import { ExamSectionController } from '../../../interface-adapters/controllers/ExamSectionController';
import { ManageExamSections } from '../../../use-cases/exam/ManageExamSections';
import { DrizzleExamSectionRepository } from '../../../interface-adapters/repositories/DrizzleExamSectionRepository';

import { authMiddleware, ROLE_ADMIN, ROLE_USER } from '../middleware/authMiddleware';

const router = Router();

const sectionRepository = new DrizzleExamSectionRepository();
const manageExamSections = new ManageExamSections(sectionRepository);
const sectionController = new ExamSectionController(manageExamSections);

router.post('/', authMiddleware(ROLE_ADMIN), sectionController.create);
router.get('/exam/:examId', authMiddleware(ROLE_USER), sectionController.getByExamId);
router.get('/:id', authMiddleware(ROLE_USER), sectionController.getById);
router.patch('/:id', authMiddleware(ROLE_ADMIN), sectionController.update);
router.patch('/:id/reorder', authMiddleware(ROLE_ADMIN), sectionController.reorder);
router.delete('/:id', authMiddleware(ROLE_ADMIN), sectionController.delete);

export { router as examSectionRoutes };
