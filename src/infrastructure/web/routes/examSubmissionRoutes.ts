import { Router } from 'express';
import { ExamSubmissionController } from '../../../interface-adapters/controllers/ExamSubmissionController';
import { uploadMiddleware } from '../middleware/uploadMiddleware';
import { ManageExamSessions } from '../../../use-cases/exam/ManageExamSessions';
import { RecordUserAnswer } from '../../../use-cases/exam/RecordUserAnswer';
import { GetExamReport } from '../../../use-cases/exam/GetExamReport';
import { DrizzleExamSubmissionRepository } from '../../../interface-adapters/repositories/DrizzleExamSubmissionRepository';
import { DrizzleUserAnswerRepository } from '../../../interface-adapters/repositories/DrizzleUserAnswerRepository';
import { DrizzleExamRepository } from '../../../interface-adapters/repositories/DrizzleExamRepository';
import { DrizzleQuestionOptionRepository } from '../../../interface-adapters/repositories/DrizzleQuestionOptionRepository';

import { authMiddleware, ROLE_USER, ROLE_ADMIN } from '../middleware/authMiddleware';
import { DrizzleQuestionRepository } from '../../../interface-adapters/repositories/DrizzleQuestionRepository';
import { DrizzleExamSectionSubmissionRepository } from '../../../interface-adapters/repositories/DrizzleExamSectionSubmissionRepository';
import { DrizzleExamSectionRepository } from '../../../interface-adapters/repositories/DrizzleExamSectionRepository';
import { DrizzleUserRepository } from '../../../interface-adapters/repositories/DrizzleUserRepository';
import { DrizzleStudentRepository } from '../../../interface-adapters/repositories/DrizzleStudentRepository';
import { DrizzleCertificationScoreRepository } from '../../../interface-adapters/repositories/DrizzleCertificationScoreRepository';

const router = Router();

const submissionRepository = new DrizzleExamSubmissionRepository();
const userAnswerRepository = new DrizzleUserAnswerRepository();
const examRepository = new DrizzleExamRepository();
const optionRepository = new DrizzleQuestionOptionRepository();
const questionRepository = new DrizzleQuestionRepository();
const sectionSubmissionRepository = new DrizzleExamSectionSubmissionRepository();
const sectionRepository = new DrizzleExamSectionRepository();
const userRepository = new DrizzleUserRepository();
const studentRepository = new DrizzleStudentRepository();
const certificationScoreRepository = new DrizzleCertificationScoreRepository();

const manageExamSessions = new ManageExamSessions(
    submissionRepository, 
    examRepository, 
    userAnswerRepository, 
    questionRepository,
    sectionSubmissionRepository,
    sectionRepository,
    certificationScoreRepository,
    studentRepository
);
const recordUserAnswer = new RecordUserAnswer(
    userAnswerRepository,
    sectionSubmissionRepository,
    optionRepository,
    questionRepository
);
const getExamReport = new GetExamReport(
    userRepository,
    studentRepository,
    submissionRepository,
    userAnswerRepository,
    questionRepository,
    optionRepository,
);

const controller = new ExamSubmissionController(manageExamSessions, recordUserAnswer, getExamReport);

router.get('/report', authMiddleware(ROLE_ADMIN), controller.getReport);
router.get('/history', authMiddleware(ROLE_USER), controller.getHistory);
router.post('/start', authMiddleware(ROLE_USER), controller.start);
router.post('/:id/finish', authMiddleware(ROLE_USER), controller.finish);
router.post('/sections/:id/finish', authMiddleware(ROLE_USER), controller.finishSection);
router.post('/:id/answers', authMiddleware(ROLE_USER), uploadMiddleware.single('audio'), controller.recordAnswer);

export const examSubmissionRoutes = router;
