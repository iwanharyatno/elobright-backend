import { pgTable, serial, varchar, timestamp, uuid, integer, text, boolean, decimal } from 'drizzle-orm/pg-core';

export const usersTable = pgTable('users', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const examsTable = pgTable('exams', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }),
    type: varchar('type', { length: 50 }),
    durationMinutes: integer('duration_minutes'),
});

export const examSectionsTable = pgTable('exam_sections', {
    id: uuid('id').primaryKey().defaultRandom(),
    examId: uuid('exam_id').references(() => examsTable.id).notNull(),
    title: varchar('title', { length: 100 }),
    instructions: text('instructions'),
    orderIndex: integer('order_index'),
});

export const questionsTable = pgTable('questions', {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id').references(() => examSectionsTable.id).notNull(),
    audioUrl: text('audio_url'),
    imageUrl: text('image_url'),
    narrativeText: text('narrative_text'),
    questionText: text('question_text').notNull(),
    questionType: varchar('question_type', { length: 50 }),
    points: integer('points').default(1),
});

export const questionOptionsTable = pgTable('question_options', {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id').references(() => questionsTable.id).notNull(),
    optionText: text('option_text'),
    isCorrect: boolean('is_correct').default(false),
});

export const examSubmissionsTable = pgTable('exam_submissions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id').references(() => usersTable.id).notNull(),
    examId: uuid('exam_id').references(() => examsTable.id).notNull(),
    status: varchar('status', { length: 50 }),
    totalScore: integer('total_score').default(0),
    startedAt: timestamp('started_at').defaultNow(),
    submittedAt: timestamp('submitted_at'),
});

export const userAnswersTable = pgTable('user_answers', {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id').references(() => examSubmissionsTable.id).notNull(),
    questionId: uuid('question_id').references(() => questionsTable.id).notNull(),
    selectedOptionId: uuid('selected_option_id').references(() => questionOptionsTable.id),
    textResponse: text('text_response'),
    audioResponseUrl: text('audio_response_url'),
});
