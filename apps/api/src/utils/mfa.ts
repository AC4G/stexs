import {
	CODE_EXPIRED,
	INTERNAL_ERROR,
	INVALID_CODE,
	MFA_EMAIL_DISABLED,
	MFA_PARAMETER_REQUIRED,
	MFA_TOTP_DISABLED,
} from 'utils-node/errors';
import logger from '../logger';
import { getTOTPForVerification } from './totp';
import { isExpired } from 'utils-node';
import { getEmailInfo, getTOTPStatus } from '../repositories/auth/mfa';
import { MFA_EMAIL_CODE_EXPIRATION } from '../../env-config';
import { NextFunction, Response } from 'express';
import { Request as JWTRequest } from 'express-jwt';
import { message } from '../utils/messageBuilder';
import { extractError } from 'utils-node/logger';

export interface MFAError {
	status: number;
	info: {
		code: string;
		message: string;
	};
	data?: Record<string, any>;
}

export async function validateMFA(
	userId: string,
	type: 'totp' | 'email',
	code: string,
): Promise<MFAError | null> {
	try {
		if (type === 'totp') {
			const { rowCount, rows } = await getTOTPStatus(userId);

			if (!rowCount) {
				logger.error('Failed to fetch MFA totp code and totp_secret', { userId });
				return {
					status: 500,
					info: INTERNAL_ERROR,
				};
			}

			const row = rows[0];

			if (!row.totp_verified_at || !row.totp_secret) {
				logger.debug('MFA TOTP is disabled', { userId });
				return {
					status: 400,
					info: MFA_TOTP_DISABLED,
				};
			}

			const totp = getTOTPForVerification(row.totp_secret!);

			if (totp.validate({ token: code, window: 1 }) === null) {
				logger.debug('Invalid code provided for MFA TOTP password change', { userId });
				return {
					status: 403,
					info: INVALID_CODE,
					data: {
						location: 'body',
						path: 'code',
					},
				};
			}
		}

		if (type === 'email') {
			const { rowCount, rows } = await getEmailInfo(userId);

			if (!rowCount) {
				logger.error('Failed to fetch MFA email status, code and timestamp', { userId });
				return {
					status: 500,
					info: INTERNAL_ERROR,
				};
			}

			if (!rows[0].email) {
				logger.debug('MFA email is disabled', { userId });
				return {
					status: 400,
					info: MFA_EMAIL_DISABLED,
				};
			}

			if (code !== rows[0].email_code) {
				logger.debug('Invalid MFA code provided', { userId });
				return {
					status: 403,
					info: INVALID_CODE,
					data: {
						location: 'body',
						path: 'code',
					},
				};
			}

			const emailCodeSentAt = rows[0].email_code_sent_at;

			if (!emailCodeSentAt || isExpired(emailCodeSentAt, MFA_EMAIL_CODE_EXPIRATION)) {
				logger.debug('MFA email code is expired', { userId });
				return {
					status: 403,
					info: CODE_EXPIRED,
					data: {
						location: 'body',
						path: 'code',
					},
				};
			}
		}
	} catch (err) {
		logger.error('Error while validating MFA', { error: extractError(err) });
		return {
			status: 500,
			info: INTERNAL_ERROR,
		};
	}

	return null;
}
export function mfaValidationMiddleware() {
	return (req: JWTRequest, res: Response, next: NextFunction) => {
		const userId = req.auth?.sub!;
		const {
			type,
			code,
		}: {
			type: 'totp' | 'email';
			code: string;
		} = req.body;

		if (!userId || !type || !code) {
			return res.status(400).json(
				message('Failed to validate MFA.', {}, [
					{
						info: MFA_PARAMETER_REQUIRED,
					},
				])
			);
		}

		validateMFA(userId, type, code)
			.then((mfaError) => {
				if (mfaError) {
					return res.status(mfaError.status).json(
						message('MFA validation failed.', {}, [
							{
								info: mfaError.info,
								data: mfaError.data,
							},
						])
					);
				}

				next();
			})
			.catch((err) => {
				logger.error('Unexpected error in MFA validation', { error: extractError(err) });
				return res.status(500).json(
					message('Internal server error during MFA validation.', {}, [
						{
							info: INTERNAL_ERROR,
						}
					])
				);
			});
	};
}
