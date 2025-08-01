import {
	expect,
	jest,
	describe,
	afterEach,
	beforeAll,
	afterAll,
	it,
} from '@jest/globals';

const mockQuery = jest.fn();

import { NextFunction } from 'express';
import request from 'supertest';
import app from '../../../src/app';
import {
	CODE_EXPIRED,
	CODE_FORMAT_INVALID_EMAIL,
	CODE_FORMAT_INVALID_TOTP,
	CODE_LENGTH_MISMATCH,
	CODE_REQUIRED,
	EMAIL_REQUIRED,
	INVALID_CODE,
	INVALID_EMAIL,
	INVALID_PASSWORD,
	INVALID_PASSWORD_LENGTH,
	NEW_PASSWORD_EQUALS_CURRENT,
	PASSWORD_REQUIRED,
	TYPE_REQUIRED,
	UNSUPPORTED_TYPE,
} from 'utils-node/errors';
import { advanceTo, clear } from 'jest-date-mock';
import { message } from '../../../src/utils/messageBuilder';
import { getTOTPForVerification } from '../../../src/utils/totp';
import { hashPassword } from '../../../src/utils/password';

jest.mock('../../../src/utils/mfa', () => {
	return {
		mfaValidationMiddleware: jest.fn(
			() => (req: Request, res: Response, next: NextFunction) => next(),
		),
	};
});

jest.mock('../../../src/middlewares/jwtMiddleware', () => {
	return {
		validateAccessToken: jest.fn(
			() => (req: Request, res: Response, next: NextFunction) => next(),
		),
		validateRefreshToken: jest.fn(
			() => (req: Request, res: Response, next: NextFunction) => next(),
		),
		validateSignInConfirmOrAccessToken: jest.fn(
			() => (req: Request, res: Response, next: NextFunction) => next(),
		),
		checkTokenGrantType: jest.fn(
			() => (req: Request, res: Response, next: NextFunction) => next(),
		),
		validateSignInConfirmToken: jest.fn(
			() => (req: Request, res: Response, next: NextFunction) => next(),
		),
		transformJwtErrorMessages: jest.fn(
			() => (err: Object, req: Request, res: Response, next: NextFunction) => {},
		),
	}
});

jest.mock('../../../src/db', () => {
	return {
		__esModule: true,
		default: {
			query: mockQuery,
			withTransaction: async (callback: any) => {
				const mockClient = {
					query: mockQuery,
				};

				try {
					return await callback(mockClient);
				} catch (e) {
					throw e;
				}
			},
		},
	};
});

jest.mock('../../../src/producers/emailProducer', () => {
  const actual = jest.requireActual<typeof import('../../../src/producers/emailProducer')>(
    '../../../src/producers/emailProducer'
  );

  return {
    ...actual,
    sendEmailMessage: jest.fn(),
  };
});

describe('User Routes', () => {
	afterEach(() => {
		jest.clearAllMocks();
	});

	beforeAll(() => {
		advanceTo(new Date('2023-09-15T12:00:00'));
	});

	afterAll(() => {
		clear();
	});

	it('should handle email change verification with expired code', async () => {
		mockQuery.mockResolvedValueOnce({
			rows: [
				{
					email_change_sent_at: '2023-09-15T10:00:00',
				},
			],
			rowCount: 1,
		} as never);

		const response = await request(app)
			.post('/auth/user/email/verify')
			.send({ code: 'FGSLKJ23' });

		expect(response.status).toBe(403);
		expect(response.body).toEqual(
			message('Email change code has expired.', {}, [
				{ info: CODE_EXPIRED }
			]).onTest(),
		);
	});

	it('should handle email change verification with invalid code', async () => {
		mockQuery.mockResolvedValueOnce({
			rows: [],
			rowCount: 0,
		} as never);

		const response = await request(app)
			.post('/auth/user/email/verify')
			.send({ code: 'FGSLKJ23' });

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Invalid email verification code.', {}, [
				{ info: INVALID_CODE }
			]).onTest(),
		);
	});

	it('should handle email change with expired verification code', async () => {
		mockQuery.mockResolvedValueOnce({
			rows: [
				{
					email_change_sent_at: '2023-09-15T10:59:00',
				},
			],
			rowCount: 1,
		} as never);

		const response = await request(app)
			.post('/auth/user/email/verify')
			.send({ code: 'FGSLKJ23' });

		expect(response.status).toBe(403);
		expect(response.body).toEqual(
			message('Email change code has expired.', {}, [
				{ info: CODE_EXPIRED }
			]).onTest(),
		);
	});

	it('should handle email change verification', async () => {
		mockQuery.mockResolvedValueOnce({
			rows: [
				{
					email_change_sent_at: '2023-09-15T12:00:00',
				},
			],
			rowCount: 1,
		} as never);

		mockQuery.mockResolvedValueOnce({
			rows: [],
			rowCount: 1,
		} as never);

		const response = await request(app)
			.post('/auth/user/email/verify')
			.send({ code: 'FGSLKJ23' });

		expect(response.status).toBe(200);
		expect(response.body).toEqual(
			message('Email successfully changed.').onTest(),
		);
	});

	it('should handle get user data', async () => {
		mockQuery.mockResolvedValueOnce({
			rows: [
				{
					id: 1,
					email: 'test@example.com',
					raw_user_meta_data: {},
					created_at: 'date',
					updated_at: 'date',
				},
			],
			rowCount: 1,
		} as never);

		const response = await request(app)
			.get('/auth/user');

		expect(response.status).toBe(200);
		expect(response.body).toEqual(
			message('User data retrieved successfully.', {
				id: 1,
				email: 'test@example.com',
				raw_user_meta_data: {},
				created_at: expect.any(String),
				updated_at: expect.any(String),
			}).onTest(),
		);
	});

	it('should handle password change with missing password', async () => {
		const response = await request(app)
			.post('/auth/user/password');

		const dataPassword = {
			location: 'body',
			path: 'password',
		};
		const dataType = {
			location: 'body',
			path: 'type',
		}; 

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Validation of request data failed.', {}, [
				{
					info: PASSWORD_REQUIRED,
					data: dataPassword,
				},
				{
					info: INVALID_PASSWORD,
					data: dataPassword,
				},
				{
					info: INVALID_PASSWORD_LENGTH,
					data: dataPassword,
				},
				{
					info: TYPE_REQUIRED,
					data: dataType,
				},
				{
					info: UNSUPPORTED_TYPE,
					data: dataType,
				},
				{
					info: CODE_REQUIRED,
					data: {
						location: 'body',
						path: 'code',
					},
				},
			]).onTest(),
		);
	});

	it('should handle password change with invalid password according to regex specification', async () => {
		const response = await request(app)
			.post('/auth/user/password')
			.send({
				password: 'test123456',
				code: 'mfa_code',
				type: 'totp',
			});

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Validation of request data failed.', {}, [
				{
					info: INVALID_PASSWORD,
					data: {
						location: 'body',
						path: 'password',
					},
				},
				{
					info: CODE_FORMAT_INVALID_TOTP,
					data: {
						location: 'body',
						path: 'code',
					}
				},
			]).onTest(),
		);
	});

	it('should handle password with current password', async () => {
		const code = getTOTPForVerification(
			'VGQZ4UCUUEC22H4QRRRHK64NKMQC4WBZ',
		).generate();

		const password = 'Test12345.';
		const passwordHash = await hashPassword(password);

		mockQuery.mockResolvedValueOnce({
			rows: [
				{
					encrypted_password: passwordHash,
				},
			],
			rowCount: 1,
		} as never);

		const response = await request(app)
			.post('/auth/user/password')
			.send({
				password,
				code,
				type: 'totp',
			});

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('New password matches the current password.', {}, [
				{
					info: NEW_PASSWORD_EQUALS_CURRENT,
					data: {
						location: 'body',
						path: 'password',
					},
				},
			]).onTest(),
		);
	});

	it('should handle password change', async () => {
		const code = getTOTPForVerification(
			'VGQZ4UCUUEC22H4QRRRHK64NKMQC4WBZ',
		).generate();

		const passwordHash = await hashPassword('Test12345.');
		const newPassword = 'NewTest12345.';

		mockQuery.mockResolvedValueOnce({
			rows: [
				{
					encrypted_password: passwordHash,
				},
			],
			rowCount: 1,
		} as never);

		mockQuery.mockResolvedValueOnce({
			rows: [],
			rowCount: 1,
		} as never);

		const response = await request(app)
			.post('/auth/user/password')
			.send({
				password: newPassword,
				code,
				type: 'totp',
			});

		expect(response.status).toBe(200);
		expect(response.body).toEqual(
			message('Password changed successfully.').onTest(),
		);
	});

	it('should handle password change with password having less then 10 characters', async () => {
		const response = await request(app)
			.post('/auth/user/password')
			.send({
				password: 'Test123.',
				code: 'mfa_code',
				type: 'totp',
			});

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Validation of request data failed.', {}, [
				{
					info: INVALID_PASSWORD_LENGTH,
					data: {
						location: 'body',
						path: 'password',
					},
				},
				{
					info: CODE_FORMAT_INVALID_TOTP,
					data: {
						location: 'body',
						path: 'code',
					}
				},
			]).onTest(),
		);
	});

	it('should handle email change with missing email', async () => {
		const response = await request(app)
			.post('/auth/user/email')
			.send({
				code: 'mfa_code',
				type: 'totp',
			});

		const dataEmail = {
			location: 'body',
			path: 'email',
		};

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Validation of request data failed.', {}, [
				{
					info: EMAIL_REQUIRED,
					data: dataEmail,
				},
				{
					info: {
						code: INVALID_EMAIL.code,
						message: INVALID_EMAIL.messages[0],
					},
					data: dataEmail,
				},
				{
					info: CODE_FORMAT_INVALID_TOTP,
					data: {
						location: 'body',
						path: 'code',
					}
				},
			]).onTest(),
		);
	});

	it('should handle email change with invalid email', async () => {
		const response = await request(app)
			.post('/auth/user/email')
			.send({
				email: 'test',
				code: 'mfa_code',
				type: 'totp',
			});

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Validation of request data failed.', {}, [
				{
					info: {
						code: INVALID_EMAIL.code,
						message: INVALID_EMAIL.messages[0],
					},
					data: {
						location: 'body',
						path: 'email',
					},
				},
				{
					info: CODE_FORMAT_INVALID_TOTP,
					data: {
						location: 'body',
						path: 'code',
					}
				},
			]).onTest(),
		);
	});

	it('should handle email change', async () => {
		const code = getTOTPForVerification(
			'VGQZ4UCUUEC22H4QRRRHK64NKMQC4WBZ',
		).generate();

		mockQuery.mockResolvedValueOnce({
			rows: [],
			rowCount: 0,
		} as never);

		mockQuery.mockResolvedValueOnce({
			rows: [],
			rowCount: 1,
		} as never);

		const response = await request(app)
			.post('/auth/user/email')
			.send({
				email: 'test@example.com',
				code,
				type: 'totp',
			});

		expect(response.status).toBe(200);
		expect(response.body).toEqual(
			message('Email change verification link has been sent to the new email address.').onTest(),
		);
	});

	it('should handle email change verification with missing code', async () => {
		const response = await request(app)
			.post('/auth/user/email/verify');

		const data = {
			location: 'body',
			path: 'code',
		}

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Validation of request data failed.', {}, [
				{
					info: CODE_REQUIRED,
					data,
				},
				{
					info: CODE_LENGTH_MISMATCH,
					data,
				},
				{
					info: CODE_FORMAT_INVALID_EMAIL,
					data
				},
			]).onTest(),
		);
	});
});
