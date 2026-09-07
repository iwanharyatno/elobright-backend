import { IExamRepository } from '../../domain/repositories/IExamRepository';
import { addCertificateExportJob, isExportActive, redisForExport, REDIS_LOCK_KEY } from '../../worker/certificateExportQueue';
import { randomUUID } from 'crypto';

export class CertificateExportService {
    constructor(private examRepository: IExamRepository) {}

    async triggerExport(params: { examId: string; triggeredBy: number }): Promise<{ exportId: string }> {
        const { examId, triggeredBy } = params;

        const exam = await this.examRepository.findById(examId);
        if (!exam) {
            throw new Error('Exam not found');
        }

        const isActive = await isExportActive();
        if (isActive) {
            throw new Error('Another export is already in progress');
        }

        const lockSet = await redisForExport.set(REDIS_LOCK_KEY, '1', 'EX', 3600, 'NX');
        if (!lockSet) {
            throw new Error('Another export is already in progress');
        }

        const exportId = randomUUID();

        try {
            await addCertificateExportJob({
                exportId,
                examId,
                triggeredBy,
            });
        } catch (e) {
            try { await redisForExport.del(REDIS_LOCK_KEY); } catch {}
            throw e;
        }

        return { exportId };
    }
}
