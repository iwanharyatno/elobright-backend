import multer from 'multer';
import path from 'path';
import fs from 'fs';

const tmpDir = path.join(__dirname, '../../../../uploads/tmp');
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpDir),
    filename: (_req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `import-${unique}${path.extname(file.originalname)}`);
    },
});

export const scoreImportUploadMiddleware = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
            'application/csv',
            'text/plain',
        ];
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.xlsx', '.xls', '.csv'];
        if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext) || /\.(xlsx|xls|csv)$/i.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type: only xlsx, xls, csv allowed'));
        }
    },
});
