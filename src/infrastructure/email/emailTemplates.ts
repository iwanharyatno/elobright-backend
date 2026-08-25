export const verificationEmailTemplate = (code: string, name?: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Elobright Email Verification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f7; padding: 24px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 480px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                    <tr>
                        <td style="padding: 32px; text-align: center; background-color: #1e40af;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Elobright</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px;">
                            <p style="margin: 0 0 16px; color: #333333; font-size: 16px;">
                                Hello ${name || 'there'},
                            </p>
                            <p style="margin: 0 0 16px; color: #333333; font-size: 16px;">
                                Use the code below to verify your email address. This code expires in 10 minutes.
                            </p>
                            <p style="margin: 0 0 24px; font-size: 36px; font-weight: bold; letter-spacing: 8px; text-align: center; color: #1e40af;">
                                ${code}
                            </p>
                            <p style="margin: 0; color: #666666; font-size: 13px;">
                                If you did not create an account with Elobright, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

export const certificateEmailTemplate = (fullName: string, email: string, downloadUrl: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Elobright Certificate</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f7; padding: 24px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 480px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                    <tr>
                        <td style="padding: 32px; text-align: center; background-color: #1e40af;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Elobright Certificate</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px;">
                            <p style="margin: 0 0 16px; color: #333333; font-size: 16px;">
                                Dear ${fullName},
                            </p>
                            <p style="margin: 0 0 16px; color: #333333; font-size: 16px;">
                                Congratulations! Your certificate is ready to download. Please confirm your identity below:
                            </p>
                            <p style="margin: 0 0 8px; color: #333333; font-size: 15px;">
                                <strong>Name:</strong> ${fullName}
                            </p>
                            <p style="margin: 0 0 24px; color: #333333; font-size: 15px;">
                                <strong>Email:</strong> ${email}
                            </p>
                            <p style="margin: 0 0 24px; text-align: center;">
                                <a href="${downloadUrl}" style="display: inline-block; padding: 12px 24px; background-color: #1e40af; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px;">
                                    Download Certificate
                                </a>
                            </p>
                            <p style="margin: 0; color: #666666; font-size: 13px;">
                                If the button does not work, copy and paste this link into your browser:
                            </p>
                            <p style="margin: 8px 0 0; color: #1e40af; font-size: 12px; word-break: break-all;">
                                ${downloadUrl}
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
export const passwordResetEmailTemplate = (resetUrl: string, name?: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Elobright Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f7; padding: 24px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 480px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                    <tr>
                        <td style="padding: 32px; text-align: center; background-color: #1e40af;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Elobright</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px;">
                            <p style="margin: 0 0 16px; color: #333333; font-size: 16px;">
                                Hello ${name || 'there'},
                            </p>
                            <p style="margin: 0 0 16px; color: #333333; font-size: 16px;">
                                We received a request to reset your password. Click the button below to choose a new one. This link expires in 60 minutes.
                            </p>
                            <p style="margin: 0 0 24px; text-align: center;">
                                <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #1e40af; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px;">
                                    Reset Password
                                </a>
                            </p>
                            <p style="margin: 0 0 8px; color: #666666; font-size: 13px;">
                                If you did not request a password reset, you can safely ignore this email and your password will remain unchanged.
                            </p>
                            <p style="margin: 0; color: #666666; font-size: 13px;">
                                If the button does not work, copy and paste this link into your browser:
                            </p>
                            <p style="margin: 8px 0 0; color: #1e40af; font-size: 12px; word-break: break-all;">
                                ${resetUrl}
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
