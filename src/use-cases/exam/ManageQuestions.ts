import { IQuestionRepository } from "../../domain/repositories/IQuestionRepository";
import { Question } from "../../domain/entities/Question";
import fs from "fs";
import path from "path";

export class ManageQuestions {
  private uploadDir = path.join(__dirname, "../../../uploads");

  constructor(private questionRepository: IQuestionRepository) {}

  private deleteFile(url: string | null) {
    if (url && url.startsWith("/uploads/")) {
      const fileName = url.replace("/uploads/", "");
      const filePath = path.join(this.uploadDir, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  async create(
    data: Omit<Question, "id">,
    audioFile?: Express.Multer.File,
    questionAudioFile?: Express.Multer.File,
    imageFile?: Express.Multer.File,
  ): Promise<Question> {
    if (data.orderIndex === undefined || data.orderIndex === null) {
      const maxOrder = await this.questionRepository.getMaxOrderIndex(
        data.sectionId,
      );
      data.orderIndex = maxOrder + 1;
    }
    if (audioFile) {
      data.audioUrl = `/uploads/${audioFile.filename}`;
    }
    if (questionAudioFile) {
      data.questionAudioUrl = `/uploads/${questionAudioFile.filename}`;
    }
    if (imageFile) {
      data.imageUrl = `/uploads/${imageFile.filename}`;
    }
    return this.questionRepository.create(data);
  }

  async getById(id: string): Promise<Question | null> {
    return this.questionRepository.findById(id);
  }

  async getBySectionId(sectionId: string): Promise<Question[]> {
    return this.questionRepository.findBySectionId(sectionId);
  }

  async update(
    id: string,
    data: Partial<Omit<Question, "id">>,
    audioFile?: Express.Multer.File,
    questionAudioFile?: Express.Multer.File,
    imageFile?: Express.Multer.File,
  ): Promise<Question | null> {
    const existingQuestion = await this.getById(id);
    if (!existingQuestion) return null;

    if (audioFile) {
      this.deleteFile(existingQuestion.audioUrl);
      data.audioUrl = `/uploads/${audioFile.filename}`;
    }
    if (questionAudioFile) {
      this.deleteFile(existingQuestion.questionAudioUrl);
      data.questionAudioUrl = `/uploads/${questionAudioFile.filename}`;
    }
    if (imageFile) {
      this.deleteFile(existingQuestion.imageUrl);
      data.imageUrl = `/uploads/${imageFile.filename}`;
    }

    return this.questionRepository.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    const existingQuestion = await this.getById(id);
    if (existingQuestion) {
      this.deleteFile(existingQuestion.audioUrl);
      this.deleteFile(existingQuestion.questionAudioUrl);
      this.deleteFile(existingQuestion.imageUrl);
    }
    return this.questionRepository.delete(id);
  }

  async reorder(id: string, direction: "up" | "down"): Promise<boolean> {
    return this.questionRepository.reorder(id, direction);
  }
}
