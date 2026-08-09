module.exports = {
  ...require('./jest.config.cjs'),
  testMatch: ['**/real-postgres.integration.spec.ts'],
  testPathIgnorePatterns: [],
};
