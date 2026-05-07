// ============================================================================
// Crux-Webmail — Setup de Pruebas de Integración
// ============================================================================
// Inicializa mocks de base de datos y Redis antes de cada suite de integración.
// ============================================================================

import { RedisMock } from './mocks/redis.mock';

// Mock global de console.error para reducir ruido en tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (args[0]?.includes?.('SEQUELIZE')) return;
    originalError(...args);
  };
});

afterAll(() => {
  console.error = originalError;
});