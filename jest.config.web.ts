// ============================================================================
// Crux-Webmail — Jest Configuration (Frontend / Web)
// ============================================================================

import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '<rootDir>/tests/web/**/*.test.ts',
    '<rootDir>/tests/web/**/*.test.tsx',
    '<rootDir>/tests/web/**/*.spec.ts',
    '<rootDir>/tests/web/**/*.spec.tsx',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@web/(.*)$': '<rootDir>/src/web/$1',
    '^@components/(.*)$': '<rootDir>/src/web/components/$1',
    '^@lib/(.*)$': '<rootDir>/src/web/lib/$1',
    '^@hooks/(.*)$': '<rootDir>/src/web/hooks/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'src/web/tsconfig.json',
        useESM: false,
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(zustand|date-fns|date-fns-jalali)/)',
  ],
  setupFilesAfterEach: [
    '<rootDir>/tests/setup.ts',
    '<rootDir>/tests/setupWeb.ts',
  ],
  collectCoverageFrom: [
    'src/web/**/*.{ts,tsx}',
    '!src/web/**/*.d.ts',
    '!src/web/**/*.test.{ts,tsx}',
    '!src/web/**/*.spec.{ts,tsx}',
    '!src/web/next.config.ts',
  ],
  coverageDirectory: 'coverage/web',
  coverageReporters: ['text', 'lcov', 'clover'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
  testTimeout: 15000,
  verbose: true,
  forceExit: false,
  detectOpenHandles: true,
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/node_modules/'],
};

export default config;