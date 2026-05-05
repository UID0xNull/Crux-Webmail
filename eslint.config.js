import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ----------------------------------------------------------------
  // Configuración base para todo el proyecto
  // ----------------------------------------------------------------
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.next/**',
      'coverage/**',
      '*.js',
      'src/web/out/**',
      'infra/**',
      '.github/**',
      'docs/**',
    ],
  },

  // ----------------------------------------------------------------
  // Flat config base rules (ESLint v9 recommended + strict)
  // ----------------------------------------------------------------
  js.configs.recommended,

  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        projectService: true,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // --- Strict ---
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',

      // --- Best practices ---
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-duplicate-imports': 'error',
      'no-useless-catch': 'error',
      'prefer-const': 'error',
      'no-var': 'error',

      // --- Style ---
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'curly': ['error', 'all'],
      'brace-style': ['error', '1tbs'],
    },
  },

  // ----------------------------------------------------------------
  // Configuración específica para el backend (server)
  // ----------------------------------------------------------------
  {
    files: ['src/server/**/*.{ts,tsx}'],
    rules: {
      // Server puede usar console.log para logs de infra
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // ----------------------------------------------------------------
  // Configuración específica para el frontend (web)
  // ----------------------------------------------------------------
  {
    files: ['src/web/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // ----------------------------------------------------------------
  // Tests — reglas más permisivas para mocking y factories
  // ----------------------------------------------------------------
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      'no-console': 'off',
    },
  },
];