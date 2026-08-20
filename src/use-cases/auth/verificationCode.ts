export const VERIFICATION_CODE_TTL_MINUTES = 10;

export const generateVerificationCode = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

export const getVerificationCodeExpiry = (): Date => {
    return new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);
};