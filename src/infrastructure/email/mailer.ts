import { env } from '../../config/env';
import { IEmailService } from '../../domain/repositories/IEmailService';
import { addVerificationEmailJob, addCertificateEmailJob, addPasswordResetEmailJob } from '../../worker';

export class NodemailerEmailService implements IEmailService {
    async sendVerificationCode(to: string, code: string, name?: string): Promise<void> {
        if (!env.SMTP_HOST) {
            throw new Error('SMTP is not configured');
        }
        await addVerificationEmailJob({ to, code, name });
    }

    async sendCertificateEmail(to: string, fullName: string, email: string, downloadUrl: string): Promise<void> {
        if (!env.SMTP_HOST) {
            throw new Error('SMTP is not configured');
        }
        await addCertificateEmailJob({ to, fullName, email, downloadUrl });
    }

    async sendPasswordResetEmail(to: string, name?: string, resetUrl?: string): Promise<void> {
        if (!env.SMTP_HOST) {
            throw new Error('SMTP is not configured');
        }
        await addPasswordResetEmailJob({ to, name, resetUrl: resetUrl || '' });
    }
}