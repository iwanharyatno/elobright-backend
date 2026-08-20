export interface IEmailService {
    sendVerificationCode(to: string, code: string, name?: string): Promise<void>;
    sendCertificateEmail(to: string, fullName: string, email: string, downloadUrl: string): Promise<void>;
}