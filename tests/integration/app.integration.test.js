const app = require('../src/app');

describe('App Setup', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await require('supertest')(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('environment');
    });
  });

  describe('GET /', () => {
    it('should return API info', async () => {
      const response = await require('supertest')(app)
        .get('/')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('endpoints');
    });
  });

  describe('GET /invalid-endpoint', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await require('supertest')(app)
        .get('/invalid-endpoint')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    });
  });

  describe('Error handling', () => {
    it('should handle errors gracefully', async () => {
      const response = await require('supertest')(app)
        .post('/')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });
});
