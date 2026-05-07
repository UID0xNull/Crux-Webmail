// ============================================================================
// Crux-Webmail — Jest Global Setup
// ============================================================================

// Suprimir warnings de Sequelize en tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('SEQUELIZE')) return;
    originalWarn(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
});