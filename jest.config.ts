// ============================================================================
// Crux-Webmail — Jest Configuration
// ============================================================================

import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/*.test.ts',
    '**/*.spec.ts',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/server/$1',
    '^@config/(.*)$': '<rootDir>/src/server/config/$1',
    '^@modules/(.*)$': '<rootDir>/src/server/modules/$1',
    '^@middleware/(.*)$': '<rootDir>/src/server/middleware/$1',
    '^@utils/(.*)$': '<rootDir>/src/server/utils/$1',
    '^@types/(.*)$': '<rootDir>/src/server/types/$1',
    '^@errors/(.*)$': '<rootDir>/src/server/errors/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'src/server/tsconfig.json',
        useESM: false,
      },
    ],
  },
  collectCoverageFrom: [
    'src/server/**/*.ts',
    '!src/server/**/*.d.ts',
    '!src/server/**/*.test.ts',
    '!src/server/app.ts', // App bootstrap no se testea directamente
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testTimeout: 15000,
  verbose: true,
  forceExit: false,
  detectOpenHandles: true,
};

export default config;