import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export interface CertificatePdfData {
    fullName: string;
    finalScore: number;
}

const FRONT_IMAGE_PATH = path.join(process.cwd(), 'assets', 'Sertif_Front.jpeg');
const BACK_IMAGE_PATH = path.join(process.cwd(), 'assets', 'Sertif_Back.jpeg');

const getProficiencyLevel = (score: number): string => {
    if (score >= 80) return 'EXCELLENT';
    if (score >= 60) return 'GOOD';
    if (score >= 30) return 'FAIR';
    return 'POOR';
};

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

    if (fs.existsSync(FRONT_IMAGE_PATH)) {
        doc.image(FRONT_IMAGE_PATH, 0, 0, { width: pageWidth, height: pageHeight });
    } else {
        doc.rect(0, 0, pageWidth, pageHeight).fill('#ffffff');
    }

    const nameY = pageHeight * 0.430;
    doc.font('Helvetica-Bold')
       .fontSize(30)
       .fillColor('#1e3a5f')
       .text(data.fullName.toUpperCase(), 0, nameY, {
           align: 'center',
           width: pageWidth
       });

    const proficiencyY = pageHeight * 0.623;
    const proficiencyText = getProficiencyLevel(data.finalScore);
    doc.font('Helvetica-Bold')
       .fontSize(24)
       .fillColor('#4a154b')
       .text(proficiencyText, 0, proficiencyY, {
           align: 'center',
           width: pageWidth
       });

    doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });

    if (fs.existsSync(BACK_IMAGE_PATH)) {
        doc.image(BACK_IMAGE_PATH, 0, 0, { width: pageWidth, height: pageHeight });
    } else {
        doc.rect(0, 0, pageWidth, pageHeight).fill('#ffffff');
    }

    doc.end();
    await completed;

    return Buffer.concat(chunks);
};