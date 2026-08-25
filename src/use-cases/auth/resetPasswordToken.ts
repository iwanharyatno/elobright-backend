import crypto from 'crypto';

export const PASSWORD_RESET_TTL_MINUTES = 60;

export const generateResetPasswordToken = (): string => {
    return crypto.randomBytes(32).toString('hex');
};

export const hashResetPasswordToken = (token: string): string => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

export const getPasswordResetTokenExpiry = (): Date => {
    return new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
};