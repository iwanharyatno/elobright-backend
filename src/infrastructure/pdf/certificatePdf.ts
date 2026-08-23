import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export interface CertificatePdfData {
    fullName: string;
    email: string;
    examTitle: string | null;
    examScore: number;
    maxScore: number;
    finalScore: number;
    additionalScores: Record<string, number> | null;
}

const BACKGROUND_IMAGE_PATH = path.join(process.cwd(), 'assets', 'certificate-background.jpeg');

const formatScore = (value: number): string => value.toFixed(1);

export const createCertificatePdf = async (data: CertificatePdfData): Promise<Buffer> => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const completed = new Promise<void>((resolve, reject) => {
        doc.on('end', () => resolve());
        doc.on('error', (err) => reject(err));
    });

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    if (fs.existsSync(BACKGROUND_IMAGE_PATH)) {
        doc.image(BACKGROUND_IMAGE_PATH, 0, 0, { width: pageWidth, height: pageHeight });
    } else {
        doc.rect(0, 0, pageWidth, pageHeight).fill('#ffffff');
    }

    const drawCentered = (text: string, y: number, size: number, font: string, color: string, maxWidth = pageWidth * 0.8) => {
        const boxX = (pageWidth - maxWidth) / 2;
        doc.font(font).fontSize(size).fillColor(color).text(text, boxX, y, {
            align: 'center',
            width: maxWidth,
        });
    };

    drawCentered('CERTIFICATE OF ACHIEVEMENT', pageHeight * 0.16, 34, 'Helvetica-Bold', '#1e3a5f');
    drawCentered('This is to certify that', pageHeight * 0.28, 14, 'Helvetica', '#555555');
    drawCentered(data.fullName, pageHeight * 0.36, 42, 'Helvetica-Bold', '#1e3a5f');
    drawCentered(
        `has successfully completed the ${data.examTitle || 'exam'} assessment.`,
        pageHeight * 0.52,
        14,
        'Helvetica',
        '#555555'
    );

    drawCentered(`Total Score: ${formatScore(data.finalScore)}`, pageHeight * 0.62, 28, 'Helvetica-Bold', '#1e3a5f');

    if (data.additionalScores && Object.keys(data.additionalScores).length > 0) {
        const breakdown = Object.entries(data.additionalScores)
            .map(([name, value]) => `${name}: ${value}`)
            .join('    ');
        drawCentered(`Exam Score: ${formatScore(data.examScore)}    ${breakdown}`, pageHeight * 0.7, 12, 'Helvetica', '#555555');
    } else {
        drawCentered(`Exam Score: ${formatScore(data.examScore)}`, pageHeight * 0.7, 12, 'Helvetica', '#555555');
    }

    drawCentered(`Issued to ${data.email}`, pageHeight * 0.88, 10, 'Helvetica', '#888888');

    doc.end();
    await completed;

    return Buffer.concat(chunks);
};