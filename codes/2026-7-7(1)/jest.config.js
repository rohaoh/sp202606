module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'scripts/**/*.js',
    'physics/**/*.js',
    '!**/*.node',
    '!**/node_modules/**',
  ],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  coverageThreshold: {
    global: {
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0,
    },
  },
};
