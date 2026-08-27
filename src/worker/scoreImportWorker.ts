import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { ScoreImportJobData } from './scoreImportQueue';
import { queueLogger, importLogger } from '../infrastructure/logger';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import Redis from 'ioredis';

const connection = {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
};

const redisForLock = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    lazyConnect: false,
});

interface RowResult {
    row: number;
    nim: string | null;
    success: boolean;
    error?: string;
    warnings?: string[];
}

function isExplicitClear(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return value === 0;
    const s = String(value).trim();
    if (s === '') return false;
    const lower = s.toLowerCase();
    return lower === 'null' || lower === 'null()' || s === '-' || lower === '0';
}

function isEmptyCell(value: any): boolean {
    if (value === null || value === undefined) return true;
    const s = String(value).trim();
    return s === '';
}

function parseScoreValue(raw: any): number | null {
    if (isEmptyCell(raw)) return null; // skip
    if (isExplicitClear(raw)) return null; // signal clear - caller checks isExplicitClear before this
    const num = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
    if (Number.isNaN(num)) return null;
    return num;
}

async function readWorkbook(filePath: string): Promise<{ headers: string[], rows: any[][], warnings: string[] }> {
    const ext = path.extname(filePath).toLowerCase();
    const warnings: string[] = [];
    let headers: string[] = [];
    let rows: any[][] = [];

    if (ext === '.csv') {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const records = parse(content, { skip_empty_lines: true, trim: true }) as any[][];
        if (records.length === 0) return { headers: [], rows: [], warnings: ['Empty CSV'] };
        headers = (records[0] as any[]).map(h => String(h ?? '').trim());
        rows = records.slice(1);
    } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) return { headers: [], rows: [], warnings: ['Empty workbook'] };
        const headerRow = worksheet.getRow(1);
        headers = [];
        headerRow.eachCell((cell, colNumber) => {
            headers[colNumber - 1] = String(cell.value ?? '').trim();
        });
        // Handle sparse headers: fill gaps
        headers = headers.map(h => h ?? '').map(h => String(h).trim());
        // Remove trailing empties
        while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();

        rows = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const values: any[] = [];
            row.eachCell((cell, colNumber) => {
                values[colNumber - 1] = cell.value;
            });
            // Pad to headers length
            while (values.length < headers.length) values.push(null);
            // Skip entirely empty rows
            const isEmpty = values.every(v => isEmptyCell(v));
            if (!isEmpty) rows.push(values);
        });
    }
    return { headers, rows, warnings };
}

const processScoreImport = async (job: Job<ScoreImportJobData>): Promise<{ total: number; success: number; failed: number; warnings: string[]; errors: RowResult[] }> => {
    const { filePath, examId, importId, originalName, uploadedBy } = job.data;
    queueLogger.info(`[ScoreImport] Starting ${importId} exam ${examId} file ${filePath}`);
    importLogger.info(`Import started`, { importId, examId, filePath, originalName, uploadedBy });

    // Lazy imports to avoid circular deps during worker startup
    const { db } = await import('../infrastructure/database/db');
    const { studentsTable, examSubmissionsTable } = await import('../infrastructure/database/schema');
    const { eq, and, sql, desc } = await import('drizzle-orm');
    const { DrizzleStudentRepository } = await import('../interface-adapters/repositories/DrizzleStudentRepository');
    const { DrizzleExamSubmissionRepository } = await import('../interface-adapters/repositories/DrizzleExamSubmissionRepository');
    const { DrizzleCertificationScoreRepository } = await import('../interface-adapters/repositories/DrizzleCertificationScoreRepository');
    const { DrizzleExamSectionRepository } = await import('../interface-adapters/repositories/DrizzleExamSectionRepository');
    const { DrizzleCertificationAdditionalScoreRepository } = await import('../interface-adapters/repositories/DrizzleCertificationAdditionalScoreRepository');
    const { DrizzleExamRepository } = await import('../interface-adapters/repositories/DrizzleExamRepository');

    const studentRepo = new DrizzleStudentRepository();
    const submissionRepo = new DrizzleExamSubmissionRepository();
    const certRepo = new DrizzleCertificationScoreRepository();
    const sectionRepo = new DrizzleExamSectionRepository();
    const additionalRepo = new DrizzleCertificationAdditionalScoreRepository();
    const examRepo = new DrizzleExamRepository();

    // Fetch exam validation
    const exam = await examRepo.findById(examId);
    if (!exam) {
        importLogger.error(`Import failed: exam not found`, { importId, examId, filePath, where: 'exam validation' });
        throw new Error(`Exam not found: ${examId}`);
    }

    const examSections = await sectionRepo.findByExamId(examId);
    const sectionMapLower = new Map<string, { id: string; title: string | null }>();
    for (const s of examSections) {
        const key = (s.title ?? s.id).toLowerCase();
        // store canonical title for later use when storing override
        sectionMapLower.set(key, { id: s.id, title: s.title ?? null });
        // also store id lower for legacy
        sectionMapLower.set(s.id.toLowerCase(), { id: s.id, title: s.title ?? null });
    }
    const sectionTitleByLower = new Map<string, string>();
    for (const s of examSections) {
        const canonical = s.title ?? s.id;
        sectionTitleByLower.set(canonical.toLowerCase(), canonical);
    }

    const additionalConfigs = await additionalRepo.findAll();
    const additionalMapLower = new Map<string, { scoreName: string; weight: number }>();
    for (const c of additionalConfigs) {
        additionalMapLower.set(c.scoreName.toLowerCase(), c);
    }

    // Read file
    let headers: string[] = [];
    let rows: any[][] = [];
    let fileWarnings: string[] = [];
    try {
        const parsed = await readWorkbook(filePath);
        headers = parsed.headers;
        rows = parsed.rows;
        fileWarnings = parsed.warnings;
        importLogger.info(`File read success`, { importId, examId, filePath, where: 'file read', headers, totalRows: rows.length, fileWarnings });
    } catch (e: any) {
        importLogger.error(`Import failed: cannot read file`, { importId, examId, filePath, where: 'file read', error: e.message, stack: e.stack });
        throw new Error(`Failed to read file: ${e.message}`);
    }

    // Find NIM column index case-insensitive
    const nimIndex = headers.findIndex(h => h.toLowerCase() === 'nim');
    if (nimIndex === -1) {
        importLogger.error(`Import failed: NIM column missing`, { importId, examId, filePath, where: 'header validation', headers });
        throw new Error('NIM column is required');
    }

    // Classify other columns
    const colMeta: Array<{ index: number; header: string; type: 'section' | 'additional' | 'unknown' | 'nim' }> = [];
    const unknownHeaders: string[] = [];
    for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (i === nimIndex) { colMeta.push({ index: i, header: h, type: 'nim' }); continue; }
        if (!h) { colMeta.push({ index: i, header: h, type: 'unknown' }); unknownHeaders.push(`(empty header at col ${i + 1})`); continue; }
        const lower = h.toLowerCase();
        if (sectionMapLower.has(lower)) {
            colMeta.push({ index: i, header: h, type: 'section' });
        } else if (additionalMapLower.has(lower)) {
            colMeta.push({ index: i, header: h, type: 'additional' });
        } else {
            colMeta.push({ index: i, header: h, type: 'unknown' });
            unknownHeaders.push(h);
        }
    }

    const warnings: string[] = [...fileWarnings];
    if (unknownHeaders.length > 0) {
        const warnMsg = `Unknown columns ignored: ${unknownHeaders.join(', ')}`;
        warnings.push(warnMsg);
        importLogger.warn(`Import warnings: unknown columns`, { importId, examId, filePath, where: 'header classification', unknownHeaders, headers });
    }
    if (fileWarnings.length > 0) {
        importLogger.warn(`Import file warnings`, { importId, examId, filePath, where: 'file read', fileWarnings });
    }

    const total = rows.length;
    let success = 0;
    let failed = 0;
    const errors: RowResult[] = [];

    importLogger.info(`Import processing started`, { importId, examId, filePath, totalRows: total, headers, unknownHeaders });
    await job.updateProgress({ percent: 0, processed: 0, total, success: 0, failed: 0, warnings });

    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const rowNum = r + 2; // header is 1
        const nimRaw = row[nimIndex];
        const nim = nimRaw != null ? String(nimRaw).trim() : '';
        if (!nim) {
            failed++;
            const errMsg = 'NIM is empty';
            errors.push({ row: rowNum, nim: null, success: false, error: errMsg });
            importLogger.warn(`Row failed: NIM empty`, { importId, examId, filePath, where: `row ${rowNum}`, row: rowNum, nim: null, error: errMsg, rowData: row });
            await job.updateProgress({ percent: Math.round(((r + 1) / total) * 100), processed: r + 1, total, success, failed, warnings, errors: errors.slice(-5) });
            continue;
        }

        // NIM -> student -> userId
        let student: any = null;
        try {
            student = await studentRepo.findByStudentId(nim);
        } catch {}
        if (!student) {
            failed++;
            const errMsg = `Student not found for NIM ${nim}`;
            errors.push({ row: rowNum, nim, success: false, error: errMsg });
            importLogger.warn(`Row failed: student not found`, { importId, examId, filePath, where: `row ${rowNum} NIM=${nim}`, row: rowNum, nim, error: errMsg });
            await job.updateProgress({ percent: Math.round(((r + 1) / total) * 100), processed: r + 1, total, success, failed, warnings, errors: errors.slice(-5) });
            continue;
        }
        const userId = student.userId;

        // Find latest exam submission for examId + userId - only finished submissions
        let submissions: any[] = [];
        try {
            submissions = await submissionRepo.findByUserAndExam(userId, examId);
            // Filter to only finished submissions (submitted/finished/finished-late), do not use ongoing
            submissions = submissions.filter((s: any) => ['submitted', 'finished', 'finished-late'].includes(s.status));
        } catch (e: any) {
            failed++;
            const errMsg = `Failed to query submissions: ${e.message}`;
            errors.push({ row: rowNum, nim, success: false, error: errMsg });
            importLogger.error(`Row failed: submission query error`, { importId, examId, filePath, where: `row ${rowNum} NIM=${nim}`, row: rowNum, nim, userId, error: errMsg, stack: e.stack });
            await job.updateProgress({ percent: Math.round(((r + 1) / total) * 100), processed: r + 1, total, success, failed, warnings, errors: errors.slice(-5) });
            continue;
        }
        if (submissions.length === 0) {
            failed++;
            const errMsg = `No exam submission for NIM ${nim} and exam ${examId}`;
            errors.push({ row: rowNum, nim, success: false, error: errMsg });
            importLogger.warn(`Row failed: no submission`, { importId, examId, filePath, where: `row ${rowNum} NIM=${nim}`, row: rowNum, nim, userId, error: errMsg });
            await job.updateProgress({ percent: Math.round(((r + 1) / total) * 100), processed: r + 1, total, success, failed, warnings, errors: errors.slice(-5) });
            continue;
        }
        const latest = submissions.sort((a: any, b: any) => (new Date(b.startedAt).getTime() || 0) - (new Date(a.startedAt).getTime() || 0))[0];
        const examSubmissionId = latest.id;

        // Find certification score
        let cert: any = null;
        try {
            cert = await certRepo.findByExamSubmissionId(examSubmissionId);
            // findByExamSubmissionId joins user, but we need to ensure it matches userId - if not, try findById via other means
            if (cert && cert.userId !== userId) {
                // Fallback: search by id
                const byId = await certRepo.findById(cert.id);
                cert = byId;
            }
        } catch {}
        if (!cert) {
            failed++;
            const errMsg = `Certification score not found for NIM ${nim} (examSubmission ${examSubmissionId})`;
            errors.push({ row: rowNum, nim, success: false, error: errMsg });
            importLogger.warn(`Row failed: certification not found`, { importId, examId, filePath, where: `row ${rowNum} NIM=${nim} examSubmissionId=${examSubmissionId}`, row: rowNum, nim, examSubmissionId, error: errMsg });
            await job.updateProgress({ percent: Math.round(((r + 1) / total) * 100), processed: r + 1, total, success, failed, warnings, errors: errors.slice(-5) });
            continue;
        }

        // Build per-row additionalScore and examScoreOverride maps, with case-insensitive handling and per-key clear
        const existingAdditional: Record<string, number> = cert.additionalScore ? { ...cert.additionalScore } : {};
        const existingOverride: Record<string, number> = cert.examScoreOverride ? { ...cert.examScoreOverride } : {};

        // We'll need to create mutable copies for merging
        let newAdditional = { ...existingAdditional };
        let newOverride = { ...existingOverride };
        let hasAdditionalChange = false;
        let hasOverrideChange = false;
        const rowWarnings: string[] = [];

        for (const meta of colMeta) {
            if (meta.type === 'nim' || meta.type === 'unknown') continue;
            const rawVal = row[meta.index];
            const headerOriginal = meta.header;
            // Empty skip
            if (isEmptyCell(rawVal)) continue;
            // Explicit clear
            if (isExplicitClear(rawVal)) {
                if (meta.type === 'section') {
                    // Find canonical title for this header
                    const canonicalEntry = sectionMapLower.get(headerOriginal.toLowerCase());
                    const canonicalTitle = canonicalEntry?.title ?? headerOriginal;
                    // Need to find existing key case-insensitively to delete
                    const existingKey = Object.keys(newOverride).find(k => k.toLowerCase() === headerOriginal.toLowerCase()) 
                        ?? Object.keys(newOverride).find(k => k.toLowerCase() === (canonicalTitle ?? '').toLowerCase());
                    // Also try lower of header
                    const keyToDelete = Object.keys(newOverride).find(k => k.toLowerCase() === headerOriginal.toLowerCase());
                    if (keyToDelete) {
                        delete newOverride[keyToDelete];
                        hasOverrideChange = true;
                    } else {
                        // If not exists, no change but still consider success (no error)
                    }
                } else if (meta.type === 'additional') {
                    const canonical = additionalMapLower.get(headerOriginal.toLowerCase())?.scoreName ?? headerOriginal;
                    const keyToDelete = Object.keys(newAdditional).find(k => k.toLowerCase() === headerOriginal.toLowerCase())
                        ?? Object.keys(newAdditional).find(k => k.toLowerCase() === canonical.toLowerCase());
                    if (keyToDelete) {
                        delete newAdditional[keyToDelete];
                        hasAdditionalChange = true;
                    }
                }
                continue;
            }
            // Parse numeric 0..100
            const num = typeof rawVal === 'number' ? rawVal : Number(String(rawVal).trim().replace(',', '.'));
            if (Number.isNaN(num) || num < 0 || num > 100) {
                const warnMsg = `Row ${rowNum} col "${headerOriginal}" invalid value "${rawVal}" (must be 0..100, NULL, - or empty to skip)`;
                rowWarnings.push(warnMsg);
                importLogger.warn(`Row warning: invalid score value`, { importId, examId, filePath, where: `row ${rowNum} col "${headerOriginal}" NIM=${nim}`, row: rowNum, nim, header: headerOriginal, rawValue: rawVal, warning: warnMsg });
                continue;
            }
            if (meta.type === 'section') {
                // Determine canonical key to store: use header as sent? Spec says display as is payload, so preserve header original case
                // But for consistency, we could use canonical title case. We'll use headerOriginal as provided (preserve case)
                // Check if we should use canonical title vs headerOriginal
                const lowerHeader = headerOriginal.toLowerCase();
                // Find if there's existing key with same lower to replace
                const existingKey = Object.keys(newOverride).find(k => k.toLowerCase() === lowerHeader);
                if (existingKey) {
                    // Replace existing, preserve original header case? Use headerOriginal
                    delete newOverride[existingKey];
                    newOverride[headerOriginal] = num;
                } else {
                    newOverride[headerOriginal] = num;
                }
                hasOverrideChange = true;
            } else if (meta.type === 'additional') {
                const canonical = additionalMapLower.get(headerOriginal.toLowerCase())?.scoreName ?? headerOriginal;
                // Find existing case-insensitive
                const existingKey = Object.keys(newAdditional).find(k => k.toLowerCase() === headerOriginal.toLowerCase())
                    ?? Object.keys(newAdditional).find(k => k.toLowerCase() === canonical.toLowerCase());
                if (existingKey) {
                    delete newAdditional[existingKey];
                    newAdditional[headerOriginal] = num;
                } else {
                    newAdditional[headerOriginal] = num;
                }
                hasAdditionalChange = true;
            }
        }

        // Validate additionalScore keys after merging? Use same validation as PATCH
        try {
            if (hasAdditionalChange) {
                const validAdditionalLower = new Set(additionalConfigs.map(c => c.scoreName.toLowerCase()));
                const invalid = Object.keys(newAdditional).find(k => !validAdditionalLower.has(k.toLowerCase()));
                if (invalid) throw new Error(`Unknown additional score name: ${invalid}`);
            }
            if (hasOverrideChange) {
                const validSectionLower = new Set(examSections.map(s => (s.title ?? s.id).toLowerCase()));
                const invalid = Object.keys(newOverride).find(k => !validSectionLower.has(k.toLowerCase()));
                if (invalid) throw new Error(`Unknown section name: ${invalid}`);
            }
        } catch (e: any) {
            failed++;
            errors.push({ row: rowNum, nim, success: false, error: e.message, warnings: rowWarnings });
            importLogger.warn(`Row failed: validation error`, { importId, examId, filePath, where: `row ${rowNum} NIM=${nim}`, row: rowNum, nim, error: e.message, newAdditional, newOverride, rowWarnings });
            await job.updateProgress({ percent: Math.round(((r + 1) / total) * 100), processed: r + 1, total, success, failed, warnings, errors: errors.slice(-5) });
            continue;
        }

        // Perform updates using same rules as PATCH (two separate repo calls)
        try {
            if (hasAdditionalChange) {
                const toSave = Object.keys(newAdditional).length === 0 ? null : newAdditional;
                if (toSave === null) {
                    await certRepo.updateAdditionalScore(cert.id, {});
                    importLogger.info(`Row success: cleared all additionalScore`, { importId, examId, filePath, where: `row ${rowNum} NIM=${nim}`, row: rowNum, nim, examSubmissionId });
                } else {
                    await certRepo.updateAdditionalScore(cert.id, newAdditional);
                    importLogger.info(`Row success: updated additionalScore`, { importId, examId, filePath, where: `row ${rowNum} NIM=${nim}`, row: rowNum, nim, examSubmissionId, newAdditional, rowWarnings });
                }
            }
            if (hasOverrideChange) {
                const toSaveOverride = Object.keys(newOverride).length === 0 ? null : newOverride;
                await certRepo.updateExamScoreOverride(cert.id, toSaveOverride);
                importLogger.info(`Row success: updated examScoreOverride`, { importId, examId, filePath, where: `row ${rowNum} NIM=${nim}`, row: rowNum, nim, examSubmissionId, newOverride: toSaveOverride, rowWarnings });
            }
            if (!hasAdditionalChange && !hasOverrideChange) {
                if (rowWarnings.length > 0) {
                    warnings.push(...rowWarnings);
                    importLogger.warn(`Row success with warnings (no changes)`, { importId, examId, filePath, where: `row ${rowNum} NIM=${nim}`, row: rowNum, nim, warnings: rowWarnings });
                } else {
                    importLogger.debug(`Row success: no changes (all skipped)`, { importId, examId, filePath, where: `row ${rowNum} NIM=${nim}`, row: rowNum, nim });
                }
            } else if (rowWarnings.length > 0) {
                warnings.push(...rowWarnings);
                importLogger.warn(`Row success with warnings`, { importId, examId, filePath, where: `row ${rowNum} NIM=${nim}`, row: rowNum, nim, warnings: rowWarnings, newAdditional, newOverride });
            } else {
                importLogger.debug(`Row success`, { importId, examId, filePath, where: `row ${rowNum} NIM=${nim}`, row: rowNum, nim, examSubmissionId });
            }
            success++;
            errors.push({ row: rowNum, nim, success: true, warnings: rowWarnings });
        } catch (e: any) {
            failed++;
            errors.push({ row: rowNum, nim, success: false, error: `DB update failed: ${e.message}`, warnings: rowWarnings });
            importLogger.error(`Row failed: DB update error`, { importId, examId, filePath, where: `row ${rowNum} NIM=${nim}`, row: rowNum, nim, examSubmissionId, error: e.message, stack: e.stack, rowWarnings });
        }

        await job.updateProgress({ percent: Math.round(((r + 1) / total) * 100), processed: r + 1, total, success, failed, warnings, errors: errors.slice(-5) });
    }

    // Cleanup file
    try {
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            importLogger.info(`Import tmp file cleaned`, { importId, examId, filePath, where: 'cleanup' });
        }
    } catch (e: any) {
        importLogger.warn(`Failed to clean tmp file`, { importId, examId, filePath, where: 'cleanup', error: e.message });
    }

    // Release lock
    try {
        await redisForLock.del(`import:lock:${examId}`);
        importLogger.info(`Import lock released`, { importId, examId, where: 'lock release' });
    } catch (e: any) {
        importLogger.warn(`Failed to release lock`, { importId, examId, where: 'lock release', error: e.message });
    }

    const result = { total, success, failed, warnings, errors };
    queueLogger.info(`[ScoreImport] Completed ${importId} success ${success}/${total} failed ${failed}`, { importId, examId });
    importLogger.info(`Import completed`, { importId, examId, filePath, where: 'completed', total, success, failed, warnings, errorsCount: errors.length });
    if (failed > 0) {
        importLogger.warn(`Import completed with failures`, { importId, examId, filePath, where: 'completed', total, success, failed, warnings, errors });
    }
    return result;
};

export const scoreImportWorker = new Worker<ScoreImportJobData>(
    'score-import',
    async (job: Job<ScoreImportJobData>) => {
        const result = await processScoreImport(job);
        return result;
    },
    { connection, concurrency: 1 }
);

scoreImportWorker.on('completed', (job: Job<ScoreImportJobData>) => {
    queueLogger.info(`Score import ${job.id} completed`, { importId: job.data.importId });
    importLogger.info(`Job completed event`, { jobId: job.id, importId: job.data.importId, examId: job.data.examId, filePath: job.data.filePath, where: 'queue completed' });
});

scoreImportWorker.on('failed', (job: Job<ScoreImportJobData> | undefined, err: Error) => {
    queueLogger.error(`Score import ${job?.id} failed`, { error: err.message });
    importLogger.error(`Job failed event`, { jobId: job?.id, importId: job?.data?.importId, examId: job?.data?.examId, filePath: job?.data?.filePath, where: 'queue failed', error: err.message, stack: err.stack });
    // Ensure lock released on failure
    if (job?.data.examId) {
        redisForLock.del(`import:lock:${job.data.examId}`).catch((e: any) => {
            importLogger.warn(`Failed to release lock on job failure`, { importId: job.data.importId, examId: job.data.examId, where: 'lock release on failed', error: e.message });
        });
        // Cleanup file on failure
        const fp = job.data.filePath;
        if (fp && fs.existsSync(fp)) fs.promises.unlink(fp).catch((e: any) => {
            importLogger.warn(`Failed to clean tmp file on job failure`, { importId: job.data.importId, filePath: fp, where: 'cleanup on failed', error: e.message });
        });
    }
});

scoreImportWorker.on('error', (err: Error) => {
    queueLogger.error('Score import worker error', { error: err.message });
});

scoreImportWorker.on('progress', (job: Job<ScoreImportJobData>, progress: any) => {
    queueLogger.debug(`Score import progress ${job.id}: ${JSON.stringify(progress)}`);
});

export const closeScoreImportWorker = async (): Promise<void> => {
    await scoreImportWorker.close();
    await redisForLock.quit();
};
