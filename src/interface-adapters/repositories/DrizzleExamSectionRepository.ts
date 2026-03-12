import { IExamSectionRepository } from '../../domain/repositories/IExamSectionRepository';
import { ExamSection } from '../../domain/entities/ExamSection';
import { db } from '../../infrastructure/database/db';
import { examSectionsTable } from '../../infrastructure/database/schema';
import { eq, and, sql } from 'drizzle-orm';

export class DrizzleExamSectionRepository implements IExamSectionRepository {
    async create(data: Omit<ExamSection, 'id'>): Promise<ExamSection> {
        const [section] = await db.insert(examSectionsTable).values(data).returning();
        return section as ExamSection;
    }

    async findById(id: string): Promise<ExamSection | null> {
        const [section] = await db.select().from(examSectionsTable).where(eq(examSectionsTable.id, id));
        return (section as ExamSection) || null;
    }

    async findByExamId(examId: string): Promise<ExamSection[]> {
        const sections = await db.select()
            .from(examSectionsTable)
            .where(eq(examSectionsTable.examId, examId))
            .orderBy(examSectionsTable.orderIndex);
        return sections as ExamSection[];
    }

    async update(id: string, data: Partial<Omit<ExamSection, 'id'>>): Promise<ExamSection | null> {
        const [updatedSection] = await db.update(examSectionsTable)
            .set(data)
            .where(eq(examSectionsTable.id, id))
            .returning();
        return (updatedSection as ExamSection) || null;
    }

    async delete(id: string): Promise<boolean> {
        const result = await db.delete(examSectionsTable).where(eq(examSectionsTable.id, id)).returning();
        return result.length > 0;
    }

    async reorder(id: string, direction: 'up' | 'down'): Promise<boolean> {
        const section = await this.findById(id);
        if (!section || section.orderIndex === null) return false;

        const allSections = await this.findByExamId(section.examId);
        const currentIndex = allSections.findIndex(s => s.id === id);

        if (currentIndex === -1) return false;

        let targetSection: ExamSection | undefined;

        if (direction === 'up' && currentIndex > 0) {
            targetSection = allSections[currentIndex - 1];
        } else if (direction === 'down' && currentIndex < allSections.length - 1) {
            targetSection = allSections[currentIndex + 1];
        }

        if (!targetSection || targetSection.orderIndex === null) return false;

        // Swap orderIndex values
        await db.transaction(async (tx) => {
            await tx.update(examSectionsTable)
                .set({ orderIndex: targetSection!.orderIndex })
                .where(eq(examSectionsTable.id, section.id));

            await tx.update(examSectionsTable)
                .set({ orderIndex: section.orderIndex })
                .where(eq(examSectionsTable.id, targetSection!.id));
        });

        return true;
    }
}
