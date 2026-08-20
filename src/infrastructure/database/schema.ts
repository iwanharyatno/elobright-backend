import { pgTable, serial, varchar, timestamp, uuid, integer, text, boolean, pgEnum, bigint, jsonb, doublePrecision } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['superadmin', 'admin', 'reviewer', 'moderator', 'user']);

export const usersTable = pgTable('users', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    fullName: varchar('full_name', { length: 255 }),
    role: roleEnum('role').default('user'),
    phoneNumber: varchar('phone_number', { length: 50 }),
    isVerified: boolean('is_verified').default(false).notNull(),
    verificationCode: varchar('verification_code', { length: 6 }),
    verificationCodeExpiresAt: timestamp('verification_code_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const studentsTable = pgTable('students', {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: varchar('student_id', { length: 50 }).notNull(),
    userId: integer('user_id').references(() => usersTable.id).notNull(),
    degreeProgram: varchar('degree_program', { length: 255 }),
});

export const examsTable = pgTable('exams', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }),
    type: varchar('type', { length: 50 }),
});

export const examSectionsTable = pgTable('exam_sections', {
    id: uuid('id').primaryKey().defaultRandom(),
    examId: uuid('exam_id').references(() => examsTable.id).notNull(),
    title: varchar('title', { length: 100 }),
    instructions: text('instructions'),
    orderIndex: integer('order_index'),
    durationMinutes: integer('duration_minutes').default(0),
});

export const questionsTable = pgTable('questions', {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id').references(() => examSectionsTable.id).notNull(),
    audioUrl: text('audio_url'),
    questionAudioUrl: text('question_audio_url'),
    imageUrl: text('image_url'),
    narrativeText: text('narrative_text'),
    questionText: text('question_text').notNull(),
    questionType: varchar('question_type', { length: 50 }),
    points: integer('points').default(1),
    orderIndex: integer('order_index'),
    isActive: boolean('is_active').default(true).notNull(),
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
    timezone: varchar('timezone', { length: 100 }),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
});

export const examSectionSubmissionsTable = pgTable('exam_section_submissions', {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id').references(() => examSubmissionsTable.id).notNull(),
    examSectionId: uuid('exam_section_id').references(() => examSectionsTable.id).notNull(),
    status: varchar('status', { length: 50 }),
    totalScore: integer('total_score').default(0),
    timezone: varchar('timezone', { length: 100 }),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
    endTimeLimit: timestamp('end_time_limit', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
});

export const userAnswersTable = pgTable('user_answers', {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionSubmissionId: uuid('section_submission_id').references(() => examSectionSubmissionsTable.id).notNull(),
    questionId: uuid('question_id').references(() => questionsTable.id).notNull(),
    selectedOptionId: uuid('selected_option_id').references(() => questionOptionsTable.id),
    textResponse: text('text_response'),
    audioResponseUrl: text('audio_response_url'),
});

export const audioTelemetryTable = pgTable('audio_telemetry', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    examSessionId: text('exam_session_id').notNull(),
    configuration: text('configuration'),
    audioUrl: text('audio_url'),
    totalSize: integer('total_size'),
    timestamp: bigint('timestamp', { mode: 'number' }),
    metrics: jsonb('metrics'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const certificationAdditionalScoresTable = pgTable('certification_additional_scores', {
    id: uuid('id').primaryKey().defaultRandom(),
    scoreName: varchar('score_name', { length: 255 }).notNull(),
    weight: doublePrecision('weight').notNull(),
});

export const certificationScoresTable = pgTable('certification_score', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id').references(() => usersTable.id).notNull(),
    examSubmissionId: uuid('exam_submission_id').references(() => examSubmissionsTable.id).notNull().unique(),
    additionalScore: jsonb('additional_score'),
    examScoreOverride: doublePrecision('exam_score_override'),
});
