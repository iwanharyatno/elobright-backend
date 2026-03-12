import { ManageExams } from '../../../../src/use-cases/exam/ManageExams';
import { IExamRepository } from '../../../../src/domain/repositories/IExamRepository';
import { Exam } from '../../../../src/domain/entities/Exam';

describe('ManageExams Use Case', () => {
    let manageExams: ManageExams;
    let mockExamRepository: jest.Mocked<IExamRepository>;

    beforeEach(() => {
        mockExamRepository = {
            create: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        } as unknown as jest.Mocked<IExamRepository>;

        manageExams = new ManageExams(mockExamRepository);
    });

    it('should create an exam', async () => {
        const examData = { title: 'Test Exam', description: 'Test Description', durationMinutes: 120, type: 'TOEFL' };
        const mockCreatedExam = { id: 'exam-123', ...examData } as unknown as Exam;
        mockExamRepository.create.mockResolvedValue(mockCreatedExam);

        const result = await manageExams.create(examData);

        expect(mockExamRepository.create).toHaveBeenCalledWith(examData);
        expect(result).toEqual(mockCreatedExam);
    });

    it('should get an exam by id', async () => {
        const mockExam = { id: 'exam-123', title: 'Test Exam' } as unknown as Exam;
        mockExamRepository.findById.mockResolvedValue(mockExam);

        const result = await manageExams.getById('exam-123');

        expect(mockExamRepository.findById).toHaveBeenCalledWith('exam-123');
        expect(result).toEqual(mockExam);
    });

    it('should get all exams', async () => {
        const mockExams = [{ id: 'exam-123', title: 'Test Exam' }] as unknown as Exam[];
        mockExamRepository.findAll.mockResolvedValue(mockExams);

        const result = await manageExams.getAll();

        expect(mockExamRepository.findAll).toHaveBeenCalledWith();
        expect(result).toEqual(mockExams);
    });

    it('should update an exam', async () => {
        const updateData = { title: 'Updated Exam' };
        const mockUpdatedExam = { id: 'exam-123', ...updateData } as unknown as Exam;
        mockExamRepository.update.mockResolvedValue(mockUpdatedExam);

        const result = await manageExams.update('exam-123', updateData);

        expect(mockExamRepository.update).toHaveBeenCalledWith('exam-123', updateData);
        expect(result).toEqual(mockUpdatedExam);
    });

    it('should delete an exam', async () => {
        mockExamRepository.delete.mockResolvedValue(true);

        const result = await manageExams.delete('exam-123');

        expect(mockExamRepository.delete).toHaveBeenCalledWith('exam-123');
        expect(result).toBe(true);
    });
});
