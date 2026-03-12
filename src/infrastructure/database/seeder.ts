import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db } from './db';

const runSeeder = async () => {
    try {
        console.log('Starting seeder...');

        // Truncate tables first
        console.log('Truncating tables...');
        await db.execute(sql`
            TRUNCATE TABLE user_answers CASCADE;
            TRUNCATE TABLE exam_submissions CASCADE;
            TRUNCATE TABLE question_options CASCADE;
            TRUNCATE TABLE questions CASCADE;
            TRUNCATE TABLE exam_sections CASCADE;
            TRUNCATE TABLE exams CASCADE;
        `);
        console.log('Tables truncated.');

        // Read the SQL seeder file
        const seederFilePath = path.join(__dirname, 'seeder', 'seeder.sql');
        const sqlContent = fs.readFileSync(seederFilePath, 'utf8');

        // Execute the SQL file to insert everything
        console.log('Executing seeder.sql...');
        await db.execute(sql.raw(sqlContent));

        console.log('Database seeded successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error while seeding the database:', error);
        process.exit(1);
    }
};

runSeeder();
