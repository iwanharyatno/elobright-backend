import { Router } from 'express';
import { CertificationAdditionalScoreController } from '../../../interface-adapters/controllers/CertificationAdditionalScoreController';
import { ManageCertificationAdditionalScores } from '../../../use-cases/certification/ManageCertificationAdditionalScores';
import { DrizzleCertificationAdditionalScoreRepository } from '../../../interface-adapters/repositories/DrizzleCertificationAdditionalScoreRepository';

import { authMiddleware, ROLE_ADMIN, ROLE_USER } from '../middleware/authMiddleware';

const router = Router();

const additionalScoreRepository = new DrizzleCertificationAdditionalScoreRepository();
const manageCertificationAdditionalScores = new ManageCertificationAdditionalScores(additionalScoreRepository);
const controller = new CertificationAdditionalScoreController(manageCertificationAdditionalScores);

router.post('/', authMiddleware(ROLE_ADMIN), controller.create);
router.get('/', authMiddleware(ROLE_USER), controller.getAll);
router.get('/:id', authMiddleware(ROLE_USER), controller.getById);
router.patch('/:id', authMiddleware(ROLE_ADMIN), controller.update);
router.delete('/:id', authMiddleware(ROLE_ADMIN), controller.delete);

export { router as certificationAdditionalScoreRoutes };