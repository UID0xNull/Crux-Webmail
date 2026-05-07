// ============================================================================
// Crux-Webmail — Jest Integration Config
// ============================================================================
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/__tests__/integration/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: false,
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEach: [
    '<rootDir>/tests/setupIntegration.ts',
  ],
  testTimeout: 30000,
  forceExit: true,
  clearMocks: true,
  resetMocks: false,
  restoreMocks: true,
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage/integration',
  collectCoverageFrom: [
    'src/server/**/*.ts',
    '!src/server/**/*.d.ts',
    '!src/server/**/*.spec.ts',
    '!src/server/**/*.test.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 75,
      statements: 75,
    },
  },
  verbose: true,
};

export default config;