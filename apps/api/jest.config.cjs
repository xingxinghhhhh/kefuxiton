module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^(.+)\\.js$': '$1',
    '^@ai-agent/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
  },
};
