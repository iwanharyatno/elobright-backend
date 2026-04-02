-- 0. ADMIN USER SEEDER (Default password is 'admin123')
INSERT INTO users (email, password_hash, full_name, role, phone_number) VALUES
('superadmin@elobright.com', '$2b$10$/UtBiE3Ju4E8Q.wg4ufi2eC1NIBB1DaqJn9OwZGhTZZA94R746.q.', 'Default Super Admin', 'superadmin', '+1234567890')
ON CONFLICT (email) DO NOTHING;

-- 1. EXAM SEEDER (2 Records)
INSERT INTO exams (id, title, type, duration_minutes) VALUES
('11111111-0000-4000-8000-000000000001', 'TOEFL Practice Exam 1', 'TOEFL', 120),
('11111111-0000-4000-8000-000000000002', 'IELTS Practice Exam 1', 'IELTS', 150);

-- 2. EXAM SECTIONS SEEDER (8 Records - 4 for each exam)
INSERT INTO exam_sections (id, exam_id, title, instructions, order_index) VALUES
-- TOEFL Sections
('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Reading', 'Read the passage and answer questions.', 1),
('22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Listening', 'Listen to the audio and answer questions.', 2),
('22222222-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Writing', 'Write an essay based on the instructions.', 3),
('22222222-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Speaking', 'Speak your answer and record it.', 4),
-- IELTS Sections
('33333333-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002', 'Reading', 'Read the passage and answer questions.', 5),
('33333333-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000002', 'Listening', 'Listen to the audio and answer questions.', 6),
('33333333-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000002', 'Writing', 'Write an essay based on the instructions.', 7),
('33333333-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000002', 'Speaking', 'Speak your answer and record it.', 8);

-- We'll use an anonymous DO block in PostgreSQL for iterative dynamic inserts to prevent huge file bloat while maintaining exact requirements:
DO $$
DECLARE
    q_id UUID;
    opt_id UUID;
    exam_sec RECORD;
    i INT;
    j INT;
BEGIN

    -- 3. QUESTIONS SEEDER (28 Questions Total) & 4. QUESTION OPTIONS SEEDER (80 Options Total)
    
    -- Loop over all Exam Sections
    FOR exam_sec IN SELECT id, title FROM exam_sections LOOP
    
        IF exam_sec.title = 'Reading' OR exam_sec.title = 'Listening' THEN
            -- 5 MCQ questions each
            FOR i IN 1..5 LOOP
                q_id := gen_random_uuid();
                
                INSERT INTO questions (id, section_id, question_text, question_type, points) 
                VALUES (q_id, exam_sec.id, 'Sample MCQ Question ' || i || ' for ' || exam_sec.title, 'mcq', 1);
                
                -- Add 4 matching Options (1 correct, 3 wrong) -> generates exactly 10 MCQ * 4 options * 2 exams = 80 options total
                FOR j IN 1..4 LOOP
                    opt_id := gen_random_uuid();
                    INSERT INTO question_options (id, question_id, option_text, is_correct)
                    VALUES (opt_id, q_id, 'Option ' || j, (j = 1)); -- First option is correct
                END LOOP;
            END LOOP;
            
        ELSIF exam_sec.title = 'Writing' OR exam_sec.title = 'Speaking' THEN
            -- 2 Open-ended questions each (No options)
            FOR i IN 1..2 LOOP
                q_id := gen_random_uuid();
                
                INSERT INTO questions (id, section_id, question_text, question_type, points) 
                VALUES (
                    q_id, 
                    exam_sec.id, 
                    'Sample ' || exam_sec.title || ' Open Question ' || i, 
                    CASE WHEN exam_sec.title = 'Writing' THEN 'essay' ELSE 'audio_upload' END,
                    2
                );
            END LOOP;
        END IF;

    END LOOP;
END $$;
