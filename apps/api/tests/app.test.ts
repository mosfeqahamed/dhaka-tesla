import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('app bootstrap', () => {
  it('GET /health reports ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('echoes a request id for log correlation', async () => {
    const res = await request(app).get('/health').set('x-request-id', 'bullet-8-41');
    expect(res.headers['x-request-id']).toBe('bullet-8-41');
  });

  it('unknown routes return the standard error shape', async () => {
    const res = await request(app).get('/teslas/flying');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('malformed JSON is a 400, not a 500', async () => {
    const res = await request(app)
      .post('/health')
      .set('content-type', 'application/json')
      .send('{"seats": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
