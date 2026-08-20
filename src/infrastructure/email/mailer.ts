import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { IEmailService } from '../../domain/repositories/IEmailService';
import { verificationEmailTemplate, certificateEmailTemplate } from './emailTemplates';

export class NodemailerEmailService implements IEmailService {
    private transporter;
    private from: string;

    constructor() {
        this.from = env.EMAIL_FROM;
        this.transporter = nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_PORT === 465,
            auth: env.SMTP_USER
                ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
                : undefined,
        });
    }

    async sendVerificationCode(to: string, code: string, name?: string): Promise<void> {
        if (!env.SMTP_HOST) {
            throw new Error('SMTP is not configured');
        }

        await this.transporter.sendMail({
            from: this.from,
            to,
            subject: 'Your Elobright email verification code',
            html: verificationEmailTemplate(code, name || 'there'),
        });
    }

    async sendCertificateEmail(to: string, fullName: string, email: string, downloadUrl: string): Promise<void> {
        if (!env.SMTP_HOST) {
            throw new Error('SMTP is not configured');
        }

        await this.transporter.sendMail({
            from: this.from,
            to,
            subject: 'Your Elobright certificate is ready',
            html: certificateEmailTemplate(fullName, email, downloadUrl),
        });
    }
}