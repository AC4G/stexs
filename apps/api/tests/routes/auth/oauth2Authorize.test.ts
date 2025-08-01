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

import request from 'supertest';
import app from '../../../src/app';
import { NextFunction } from 'express';
import { advanceTo, clear } from 'jest-date-mock';
import {
	ARRAY_MIN_ONE_REQUIRED,
	CLIENT_ID_REQUIRED,
	CLIENT_NOT_FOUND,
	INVALID_URL,
	INVALID_UUID,
	REDIRECT_URL_REQUIRED,
	SCOPES_REQUIRED,
} from 'utils-node/errors'; 
import { message } from '../../../src/utils/messageBuilder';

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

describe('OAuth2 Authorize', () => {
	afterEach(() => {
		jest.clearAllMocks();
	});

	beforeAll(() => {
		advanceTo(new Date('2023-09-15T12:00:00'));
	});

	afterAll(() => {
		clear();
	});

	it('should handle authorize without client id', async () => {
		const response = await request(app)
			.post('/auth/oauth2/authorize')
			.send({
				redirect_url: 'https://example.com',
				scopes: ['inventory.read'],
			});

		const data = {
			location: 'body',
			path: 'client_id',
		};

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Validation of request data failed.', {}, [
				{
					info: CLIENT_ID_REQUIRED,
					data,
				},
				{
					info: INVALID_UUID,
					data,
				},
			]).onTest(),
		);
	});

	it('should handle authorize with invalid uuid', async () => {
		const response = await request(app)
			.post('/auth/oauth2/authorize')
			.send({
				client_id: 'invalid-uuid',
				redirect_url: 'https://example.com',
				scopes: ['inventory.read'],
			});

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Validation of request data failed.', {}, [
				{
					info: INVALID_UUID,
					data: {
						location: 'body',
						path: 'client_id',
					},
				},
			]).onTest(),
		);
	});

	it('should handle authorize without redirect url', async () => {
		const response = await request(app)
			.post('/auth/oauth2/authorize')
			.send({
				client_id: '67054312-b0bf-4c99-a4a8-565988d4c2dd',
				scopes: ['inventory.read'],
			});
		
		const data = {
			location: 'body',
			path: 'redirect_url',
		}

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Validation of request data failed.', {}, [
				{
					info: REDIRECT_URL_REQUIRED,
					data,
				},
				{
					info: INVALID_URL,
					data,
				},
			]).onTest(),
		);
	});

	it('should handle authorize with redirect url as not url', async () => {
		const response = await request(app)
			.post('/auth/oauth2/authorize')
			.send({
				client_id: '67054312-b0bf-4c99-a4a8-565988d4c2dd',
				redirect_url: 'not-url',
				scopes: ['inventory.read'],
			});

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Validation of request data failed.', {}, [
				{
					info: INVALID_URL,
					data: {
						location: 'body',
						path: 'redirect_url',
					},
				},
			]).onTest(),
		);
	});

	it('should handle authorize without scopes', async () => {
		const response = await request(app)
			.post('/auth/oauth2/authorize')
			.send({
				client_id: '67054312-b0bf-4c99-a4a8-565988d4c2dd',
				redirect_url: 'https://example.com',
			});

		const data = {
			location: 'body',
			path: 'scopes',
		};

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Validation of request data failed.', {}, [
				{
					info: SCOPES_REQUIRED,
					data,
				},
				{
					info: ARRAY_MIN_ONE_REQUIRED,
					data,
				},
			]).onTest(),
		);
	});

	it('should handle authorize with scopes as string', async () => {
		const response = await request(app)
			.post('/auth/oauth2/authorize')
			.send({
				client_id: '67054312-b0bf-4c99-a4a8-565988d4c2dd',
				redirect_url: 'https://example.com',
				scopes: 'scopes',
			});

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Validation of request data failed.', {}, [
				{
					info: ARRAY_MIN_ONE_REQUIRED,
					data: {
						location: 'body',
						path: 'scopes',
					},
				},
			]).onTest(),
		);
	});

	it('should handle authorize with empty scopes array', async () => {
		const response = await request(app)
			.post('/auth/oauth2/authorize')
			.send({
				client_id: '67054312-b0bf-4c99-a4a8-565988d4c2dd',
				redirect_url: 'https://example.com',
				scopes: [],
			});

		expect(response.status).toBe(400);
		expect(response.body).toEqual(
			message('Validation of request data failed.', {}, [
				{
					info: ARRAY_MIN_ONE_REQUIRED,
					data: {
						location: 'body',
						path: 'scopes',
					},
				},
			]).onTest(),
		);
	});

	it('should handle authorize with invalid client id', async () => {
		mockQuery.mockResolvedValueOnce({
			rows: [],
			rowCount: 0,
		} as never);

		const response = await request(app)
			.post('/auth/oauth2/authorize')
			.send({
				client_id: '67054312-b0bf-4c99-a4a8-565988d4c2dd',
				redirect_url: 'https://example.com',
				scopes: ['inventory.read'],
			});

		expect(response.status).toBe(404);
		expect(response.body).toEqual(
			message('Client not found.', {}, [
				{
					info: CLIENT_NOT_FOUND,
					data: {
						location: 'body',
						paths: ['client_id'],
					},
				},
			]).onTest(),
		);
	});

	it('should handle authorize with already connected client', async () => {
		mockQuery.mockResolvedValueOnce({
			rows: [
				{
					redirect_url: 'https://example.com',
					scopes: ['inventory.read'],
				}
			],
			rowCount: 1,
		} as never);

		mockQuery.mockResolvedValueOnce({
			rows: [],
			rowCount: 1,
		} as never);

		const response = await request(app)
			.post('/auth/oauth2/authorize')
			.send({
				client_id: '67054312-b0bf-4c99-a4a8-565988d4c2dd',
				redirect_url: 'https://example.com',
				scopes: ['inventory.read'],
			});

		expect(response.status).toBe(204);
	});

	it('should handle authorize', async () => {
		mockQuery.mockResolvedValueOnce({
			rows: [
				{
					redirect_url: 'https://example.com',
					scopes: ['inventory.read'],
				}
			],
			rowCount: 1,
		} as never);

		mockQuery.mockResolvedValueOnce({
			rows: [],
			rowCount: 0,
		} as never);

		let created_at = new Date();
		let expires = created_at.getTime() + 5 * 60 * 1000;

		mockQuery.mockResolvedValueOnce({
			rows: [
				{
					id: 1,
					created_at,
				},
			],
			rowCount: 1,
		} as never);

		mockQuery.mockResolvedValueOnce({
			rows: [],
			rowCount: 1,
		} as never);

		const response = await request(app)
			.post('/auth/oauth2/authorize')
			.send({
				client_id: '67054312-b0bf-4c99-a4a8-565988d4c2dd',
				redirect_url: 'https://example.com',
				scopes: ['inventory.read'],
			});

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject(
			message('Authorization token successfully created.', {
				code: expect.stringMatching(
					/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
				),
				expires: expires,
			}).onTest(),
		);
	});
});
