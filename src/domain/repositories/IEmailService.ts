export interface IEmailService {
    sendVerificationCode(to: string, code: string, name?: string): Promise<void>;
    sendCertificateEmail(to: string, fullName: string, email: string, downloadUrl: string): Promise<void>;
    sendPasswordResetEmail(to: string, name?: string, resetUrl?: string): Promise<void>;
}