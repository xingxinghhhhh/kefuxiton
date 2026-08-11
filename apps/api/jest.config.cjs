module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: ['/real-postgres.integration.spec.ts'],
  moduleNameMapper: {
    '^((?:\\.{1,2}/).+)\\.js$': '$1',
    '^@ai-agent/config$': '<rootDir>/../../packages/config/src/index.ts',
    '^@ai-agent/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
  },
};
