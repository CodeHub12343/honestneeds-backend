const { logger } = require('../../src/utils/logger');

describe('Logger Utility', () => {
  describe('logger.debug', () => {
    it('should log debug messages', () => {
      expect(() => {
        logger.debug('Test debug message', { key: 'value' });
      }).not.toThrow();
    });
  });

  describe('logger.info', () => {
    it('should log info messages', () => {
      expect(() => {
        logger.info('Test info message', { key: 'value' });
      }).not.toThrow();
    });
  });

  describe('logger.warn', () => {
    it('should log warn messages', () => {
      expect(() => {
        logger.warn('Test warn message', { key: 'value' });
      }).not.toThrow();
    });
  });

  describe('logger.error', () => {
    it('should log error messages', () => {
      expect(() => {
        logger.error('Test error message', { key: 'value' });
      }).not.toThrow();
    });
  });
});
