import { Router } from 'express';
import { ScoreImportController } from '../../../interface-adapters/controllers/ScoreImportController';
import { ScoreImportService } from '../../../use-cases/certification/ScoreImportService';
import { DrizzleExamRepository } from '../../../interface-adapters/repositories/DrizzleExamRepository';
import { DrizzleExamSectionRepository } from '../../../interface-adapters/repositories/DrizzleExamSectionRepository';
import { DrizzleCertificationAdditionalScoreRepository } from '../../../interface-adapters/repositories/DrizzleCertificationAdditionalScoreRepository';
import { scoreImportUploadMiddleware } from '../middleware/scoreImportUploadMiddleware';
import { authMiddleware, ROLE_ADMIN } from '../middleware/authMiddleware';

const router = Router();

const examRepository = new DrizzleExamRepository();
const sectionRepository = new DrizzleExamSectionRepository();
const additionalScoreRepository = new DrizzleCertificationAdditionalScoreRepository();

const scoreImportService = new ScoreImportService(
    examRepository,
    sectionRepository,
    additionalScoreRepository
);

const controller = new ScoreImportController(scoreImportService);

// POST /api/certification-scores/import
router.post('/import', authMiddleware(ROLE_ADMIN), scoreImportUploadMiddleware.single('file'), controller.importScores);

// GET /api/certification-scores/import/:importId/progress
router.get('/import/:importId/progress', authMiddleware(ROLE_ADMIN), controller.getProgress);

// GET /api/certification-scores/import/:importId/stream  (SSE)
router.get('/import/:importId/stream', authMiddleware(ROLE_ADMIN), controller.streamProgress);

export { router as scoreImportRoutes };
