import { ManageExamSections } from '../../../../src/use-cases/exam/ManageExamSections';
import { IExamSectionRepository } from '../../../../src/domain/repositories/IExamSectionRepository';
import { ExamSection } from '../../../../src/domain/entities/ExamSection';

describe('ManageExamSections Use Case', () => {
    let manageExamSections: ManageExamSections;
    let mockSectionRepository: jest.Mocked<IExamSectionRepository>;

    beforeEach(() => {
        mockSectionRepository = {
            create: jest.fn(),
            findById: jest.fn(),
            findByExamId: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            reorder: jest.fn()
        } as unknown as jest.Mocked<IExamSectionRepository>;

        manageExamSections = new ManageExamSections(mockSectionRepository);
    });

    it('should create an exam section', async () => {
        const sectionData = { examId: 'exam-1', title: 'Reading', instructions: 'Instructions', orderIndex: 1 };
        const mockCreated = { id: 'section-1', ...sectionData } as unknown as ExamSection;
        mockSectionRepository.create.mockResolvedValue(mockCreated);

        const result = await manageExamSections.create(sectionData);

        expect(mockSectionRepository.create).toHaveBeenCalledWith(sectionData);
        expect(result).toEqual(mockCreated);
    });

    it('should get an exam section by id', async () => {
        const mockSection = { id: 'section-1', name: 'Reading' } as unknown as ExamSection;
        mockSectionRepository.findById.mockResolvedValue(mockSection);

        const result = await manageExamSections.getById('section-1');

        expect(mockSectionRepository.findById).toHaveBeenCalledWith('section-1');
        expect(result).toEqual(mockSection);
    });

    it('should get exam sections by exam id', async () => {
        const mockSections = [{ id: 'section-1', name: 'Reading' }] as unknown as ExamSection[];
        mockSectionRepository.findByExamId.mockResolvedValue(mockSections);

        const result = await manageExamSections.getByExamId('exam-1');

        expect(mockSectionRepository.findByExamId).toHaveBeenCalledWith('exam-1');
        expect(result).toEqual(mockSections);
    });

    it('should update an exam section', async () => {
        const updateData = { title: 'Listening' };
        const mockUpdated = { id: 'section-1', ...updateData } as unknown as ExamSection;
        mockSectionRepository.update.mockResolvedValue(mockUpdated);

        const result = await manageExamSections.update('section-1', updateData);

        expect(mockSectionRepository.update).toHaveBeenCalledWith('section-1', updateData);
        expect(result).toEqual(mockUpdated);
    });

    it('should delete an exam section', async () => {
        mockSectionRepository.delete.mockResolvedValue(true);

        const result = await manageExamSections.delete('section-1');

        expect(mockSectionRepository.delete).toHaveBeenCalledWith('section-1');
        expect(result).toBe(true);
    });

    it('should reorder an exam section', async () => {
        mockSectionRepository.reorder.mockResolvedValue(true);

        const result = await manageExamSections.reorder('section-1', 'up');

        expect(mockSectionRepository.reorder).toHaveBeenCalledWith('section-1', 'up');
        expect(result).toBe(true);
    });
});
