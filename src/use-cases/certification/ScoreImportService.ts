import { IExamRepository } from '../../domain/repositories/IExamRepository';
import { IExamSectionRepository } from '../../domain/repositories/IExamSectionRepository';
import { ICertificationAdditionalScoreRepository } from '../../domain/repositories/ICertificationAdditionalScoreRepository';
import { addScoreImportJob, isImportActiveForExam } from '../../worker/scoreImportQueue';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { env } from '../../config/env';

const redisForLock = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    lazyConnect: false,
});

async function readHeaders(filePath: string): Promise<{ headers: string[]; totalRows: number }> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.csv') {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const records = parse(content, { skip_empty_lines: true, trim: true }) as any[][];
        if (records.length === 0) return { headers: [], totalRows: 0 };
        const headers = (records[0] as any[]).map(h => String(h ?? '').trim());
        const rows = records.slice(1).filter(r => r.some((v: any) => String(v ?? '').trim() !== ''));
        return { headers, totalRows: rows.length };
    } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheet = workbook.worksheets[0];
        if (!sheet) return { headers: [], totalRows: 0 };
        const headerRow = sheet.getRow(1);
        const headers: string[] = [];
        headerRow.eachCell((cell, colNumber) => {
            headers[colNumber - 1] = String(cell.value ?? '').trim();
        });
        const cleanHeaders = headers.map(h => h ?? '').map(h => String(h).trim());
        while (cleanHeaders.length > 0 && cleanHeaders[cleanHeaders.length - 1] === '') cleanHeaders.pop();
        let totalRows = 0;
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const values: any[] = [];
            row.eachCell((cell, colNumber) => {
                values[colNumber - 1] = cell.value;
            });
            const isEmpty = values.every(v => v == null || String(v).trim() === '');
            if (!isEmpty) totalRows++;
        });
        return { headers: cleanHeaders, totalRows };
    }
}

export class ScoreImportService {
    constructor(
        private examRepository: IExamRepository,
        private sectionRepository: IExamSectionRepository,
        private additionalScoreRepository: ICertificationAdditionalScoreRepository,
    ) {}

    async validateAndEnqueue(params: {
        examId: string;
        filePath: string;
        originalName: string;
        uploadedBy: number;
    }): Promise<{ importId: string; totalRows: number; warnings: string[] }> {
        const { examId, filePath, originalName, uploadedBy } = params;

        // Check exam exists
        const exam = await this.examRepository.findById(examId);
        if (!exam) {
            try { if (fs.existsSync(filePath)) await fs.promises.unlink(filePath); } catch {}
            throw new Error('Exam not found');
        }

        // Per-examId concurrency guard
        const isActive = await isImportActiveForExam(examId);
        if (isActive) {
            try { if (fs.existsSync(filePath)) await fs.promises.unlink(filePath); } catch {}
            throw new Error('Import already in progress for this exam');
        }
        // Redis lock check as well
        const lockKey = `import:lock:${examId}`;
        const lockSet = await redisForLock.set(lockKey, '1', 'EX', 3600, 'NX');
        if (!lockSet) {
            try { if (fs.existsSync(filePath)) await fs.promises.unlink(filePath); } catch {}
            throw new Error('Import already in progress for this exam');
        }

        // Read headers for validation
        let headers: string[] = [];
        let totalRows = 0;
        try {
            const parsed = await readHeaders(filePath);
            headers = parsed.headers;
            totalRows = parsed.totalRows;
        } catch (e: any) {
            await redisForLock.del(lockKey);
            try { if (fs.existsSync(filePath)) await fs.promises.unlink(filePath); } catch {}
            throw new Error(`Failed to read file: ${e.message}`);
        }

        const lowerHeaders = headers.map(h => h.toLowerCase());
        const nimIndex = lowerHeaders.indexOf('nim');
        if (nimIndex === -1) {
            await redisForLock.del(lockKey);
            try { if (fs.existsSync(filePath)) await fs.promises.unlink(filePath); } catch {}
            throw new Error('NIM column is required');
        }

        // Fetch sections and additional configs for classification
        const examSections = await this.sectionRepository.findByExamId(examId);
        const sectionMapLower = new Map<string, string>();
        for (const s of examSections) {
            const key = (s.title ?? s.id).toLowerCase();
            sectionMapLower.set(key, s.title ?? s.id);
            sectionMapLower.set(s.id.toLowerCase(), s.title ?? s.id);
        }
        const additionalConfigs = await this.additionalScoreRepository.findAll();
        const additionalMapLower = new Map<string, string>();
        for (const c of additionalConfigs) {
            additionalMapLower.set(c.scoreName.toLowerCase(), c.scoreName);
        }

        const warnings: string[] = [];
        const unknownHeaders: string[] = [];
        for (let i = 0; i < headers.length; i++) {
            if (i === nimIndex) continue;
            const h = headers[i];
            if (!h) {
                unknownHeaders.push(`(empty header at col ${i + 1})`);
                continue;
            }
            const lower = h.toLowerCase();
            if (!sectionMapLower.has(lower) && !additionalMapLower.has(lower)) {
                unknownHeaders.push(h);
            }
        }
        if (unknownHeaders.length > 0) {
            warnings.push(`Unknown columns will be ignored: ${unknownHeaders.join(', ')}`);
        }

        // If no valid data columns at all, warn but still allow enqueue? At least one known column should exist, else file is useless
        const hasValidColumn = headers.some((h, idx) => idx !== nimIndex && (sectionMapLower.has(h.toLowerCase()) || additionalMapLower.has(h.toLowerCase())));
        if (!hasValidColumn) {
            warnings.push('No known section or additional score columns found; all data columns will be ignored');
        }

        const importId = randomUUID();

        // Dispatch job
        await addScoreImportJob({
            importId,
            filePath,
            examId,
            uploadedBy,
            originalName,
            totalRows,
            warnings,
        });

        // Keep lock until worker completes (worker will delete lock on completion/failure)
        // Extend lock to cover processing time (already set with 3600s)

        return { importId, totalRows, warnings };
    }
}
