import { Router } from 'express';
import { CertificateExportController } from '../../../interface-adapters/controllers/CertificateExportController';
import { CertificateExportService } from '../../../use-cases/certification/CertificateExportService';
import { DrizzleExamRepository } from '../../../interface-adapters/repositories/DrizzleExamRepository';
import { authMiddleware, ROLE_ADMIN } from '../middleware/authMiddleware';

const router = Router();

const examRepository = new DrizzleExamRepository();
const certificateExportService = new CertificateExportService(examRepository);
const controller = new CertificateExportController(certificateExportService);

router.post('/', authMiddleware(ROLE_ADMIN), controller.triggerExport);

router.get('/:exportId/stream', authMiddleware(ROLE_ADMIN), controller.streamProgress);

router.get('/:exportId/progress', authMiddleware(ROLE_ADMIN), controller.getProgress);

router.get('/:exportId/download', controller.downloadArchive);

router.post('/:exportId/request-download', authMiddleware(ROLE_ADMIN), controller.requestDownload);

export { router as certificateExportRoutes };
