export { emailQueue, addVerificationEmailJob, addCertificateEmailJob, closeEmailQueue } from './emailQueue';
export { emailWorker, closeEmailWorker } from './emailWorker';
export type { EmailJobData, VerificationJobData, CertificateJobData } from './emailQueue';