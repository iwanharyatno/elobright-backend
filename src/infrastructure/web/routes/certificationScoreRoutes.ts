import { Router } from 'express';
import { CertificationScoreController } from '../../../interface-adapters/controllers/CertificationScoreController';
import { ManageCertificationScores } from '../../../use-cases/certification/ManageCertificationScores';
import { ManageCertificate } from '../../../use-cases/certification/ManageCertificate';
import { DrizzleCertificationScoreRepository } from '../../../interface-adapters/repositories/DrizzleCertificationScoreRepository';
import { DrizzleCertificationAdditionalScoreRepository } from '../../../interface-adapters/repositories/DrizzleCertificationAdditionalScoreRepository';
import { DrizzleUserRepository } from '../../../interface-adapters/repositories/DrizzleUserRepository';
import { DrizzleStudentRepository } from '../../../interface-adapters/repositories/DrizzleStudentRepository';
import { DrizzleExamSubmissionRepository } from '../../../interface-adapters/repositories/DrizzleExamSubmissionRepository';
import { DrizzleExamSectionSubmissionRepository } from '../../../interface-adapters/repositories/DrizzleExamSectionSubmissionRepository';
import { DrizzleExamSectionRepository } from '../../../interface-adapters/repositories/DrizzleExamSectionRepository';
import { DrizzleQuestionRepository } from '../../../interface-adapters/repositories/DrizzleQuestionRepository';
import { DrizzleExamRepository } from '../../../interface-adapters/repositories/DrizzleExamRepository';
import { NodemailerEmailService } from '../../../infrastructure/email/mailer';

import { authMiddleware, ROLE_ADMIN } from '../middleware/authMiddleware';

const router = Router();

const certificationScoreRepository = new DrizzleCertificationScoreRepository();
const additionalScoreRepository = new DrizzleCertificationAdditionalScoreRepository();
const userRepository = new DrizzleUserRepository();
const studentRepository = new DrizzleStudentRepository();
const submissionRepository = new DrizzleExamSubmissionRepository();
const sectionSubmissionRepository = new DrizzleExamSectionSubmissionRepository();
const sectionRepository = new DrizzleExamSectionRepository();
const questionRepository = new DrizzleQuestionRepository();
const examRepository = new DrizzleExamRepository();
const emailService = new NodemailerEmailService();

const manageCertificationScores = new ManageCertificationScores(
    certificationScoreRepository,
    additionalScoreRepository,
    sectionSubmissionRepository,
    sectionRepository,
    questionRepository,
    submissionRepository,
    examRepository,
    studentRepository
);
const manageCertificate = new ManageCertificate(
    certificationScoreRepository,
    additionalScoreRepository,
    userRepository,
    submissionRepository,
    sectionSubmissionRepository,
    sectionRepository,
    questionRepository,
    examRepository,
    emailService
);
const controller = new CertificationScoreController(manageCertificationScores, manageCertificate);

router.get('/', authMiddleware(ROLE_ADMIN), controller.getAll);
router.patch('/:id', authMiddleware(ROLE_ADMIN), controller.update);
router.post('/blast-email', authMiddleware(ROLE_ADMIN), controller.blastEmail);
router.get('/:id/download', controller.downloadPdf);

export { router as certificationScoreRoutes };