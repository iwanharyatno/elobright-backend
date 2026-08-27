import { IExamSubmissionRepository } from '../../domain/repositories/IExamSubmissionRepository';
import { ExamSubmission } from '../../domain/entities/ExamSubmission';
import { db } from '../../infrastructure/database/db';
import { examSubmissionsTable, examsTable, examSectionSubmissionsTable, examSectionsTable } from '../../infrastructure/database/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

export class DrizzleExamSubmissionRepository implements IExamSubmissionRepository {
    async create(data: Omit<ExamSubmission, 'id'>): Promise<ExamSubmission> {
        const [submission] = await db.insert(examSubmissionsTable).values(data).returning();
        return submission as ExamSubmission;
    }

    async update(id: string, data: Partial<Omit<ExamSubmission, 'id'>>): Promise<ExamSubmission | null> {
        const [updatedSubmission] = await db.update(examSubmissionsTable)
            .set(data)
            .where(eq(examSubmissionsTable.id, id))
            .returning();
        return (updatedSubmission as ExamSubmission) || null;
    }

    async findById(id: string): Promise<ExamSubmission | null> {
        const [submission] = await db.select().from(examSubmissionsTable).where(eq(examSubmissionsTable.id, id));
        return (submission as ExamSubmission) || null;
    }

    async findByUserAndExam(userId: number, examId: string): Promise<ExamSubmission[]> {
        const submissions = await db.select().from(examSubmissionsTable)
            .where(and(eq(examSubmissionsTable.userId, userId), eq(examSubmissionsTable.examId, examId)));
        return submissions as ExamSubmission[];
    }

    async findByExamId(examId: string): Promise<ExamSubmission[]> {
        const submissions = await db.select().from(examSubmissionsTable)
            .where(and(
                eq(examSubmissionsTable.examId, examId),
                inArray(examSubmissionsTable.status, ['submitted', 'finished', 'finished-late'])
            ));
        return submissions as ExamSubmission[];
    }

    async findByUserId(userId: number): Promise<ExamSubmission[]> {
        const results = await db.select({
            submission: examSubmissionsTable,
            exam: examsTable,
            sectionSubmission: examSectionSubmissionsTable,
            section: examSectionsTable,
        }).from(examSubmissionsTable)
            .leftJoin(examsTable, eq(examSubmissionsTable.examId, examsTable.id))
            .leftJoin(examSectionSubmissionsTable, eq(examSubmissionsTable.id, examSectionSubmissionsTable.submissionId))
            .leftJoin(examSectionsTable, eq(examSectionSubmissionsTable.examSectionId, examSectionsTable.id))
            .where(eq(examSubmissionsTable.userId, userId));

        const submissionMap = new Map<string, ExamSubmission>();
        for (const row of results) {
            const id = row.submission.id;
            if (!submissionMap.has(id)) {
                submissionMap.set(id, {
                    ...row.submission,
                    exam: row.exam || undefined,
                    examSectionSubmissions: [],
                });
            }
            if (row.sectionSubmission) {
                submissionMap.get(id)!.examSectionSubmissions!.push({
                    ...row.sectionSubmission,
                    section: row.section || undefined,
                } as any);
            }
        }

        return Array.from(submissionMap.values());
    }

    async findAllWithDetails(): Promise<ExamSubmission[]> {
        const results = await db.select({
            submission: examSubmissionsTable,
            exam: examsTable,
            sectionSubmission: examSectionSubmissionsTable,
            section: examSectionsTable,
        }).from(examSubmissionsTable)
            .leftJoin(examsTable, eq(examSubmissionsTable.examId, examsTable.id))
            .leftJoin(examSectionSubmissionsTable, eq(examSubmissionsTable.id, examSectionSubmissionsTable.submissionId))
            .leftJoin(examSectionsTable, eq(examSectionSubmissionsTable.examSectionId, examSectionsTable.id));

        const submissionMap = new Map<string, ExamSubmission>();
        for (const row of results) {
            const id = row.submission.id;
            if (!submissionMap.has(id)) {
                submissionMap.set(id, {
                    ...row.submission,
                    exam: row.exam || undefined,
                    examSectionSubmissions: [],
                });
            }
            if (row.sectionSubmission) {
                submissionMap.get(id)!.examSectionSubmissions!.push({
                    ...row.sectionSubmission,
                    section: row.section || undefined,
                } as any);
            }
        }

        return Array.from(submissionMap.values());
    }

}
