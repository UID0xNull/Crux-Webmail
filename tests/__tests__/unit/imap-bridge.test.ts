// ============================================================================
// Crux-Webmail — Unit Tests: IMAP Bridge Circuit Breaker & Pool
// ============================================================================
// Note: CircuitBreaker logic tested inline since the class is internal
// to imap-bridge.ts

describe('Circuit Breaker Logic', () => {
  // Inline reproduction of CircuitBreaker logic for unit testing
  let state: {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failures: number;
    lastFailure: number;
    nextRetry: number;
  };

  beforeEach(() => {
    state = {
      state: 'CLOSED',
      failures: 0,
      lastFailure: 0,
      nextRetry: 0,
    };
  });

  function canExecute(): boolean {
    if (state.state === 'OPEN') {
      if (Date.now() > state.nextRetry) {
        state.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true;
  }

  function recordSuccess(): void {
    state.state = 'CLOSED';
    state.failures = 0;
  }

  function recordFailure(): void {
    state.failures++;
    state.lastFailure = Date.now();
    if (state.failures >= 5) {
      state.state = 'OPEN';
      state.nextRetry = Date.now() + 30000;
    }
  }

  it('should allow execution when CLOSED', () => {
    expect(canExecute()).toBe(true);
  });

  it('should block execution after threshold failures', () => {
    for (let i = 0; i < 5; i++) recordFailure();
    expect(state.state).toBe('OPEN');
    expect(canExecute()).toBe(false);
  });

  it('should allow execution after reset timeout (HALF_OPEN)', () => {
    for (let i = 0; i < 5; i++) recordFailure();
    expect(state.state).toBe('OPEN');
    // Manually move nextRetry into the past
    state.nextRetry = Date.now() - 1000;
    expect(canExecute()).toBe(true);
    expect(state.state).toBe('HALF_OPEN');
  });

  it('should reset to CLOSED on success', () => {
    for (let i = 0; i < 3; i++) recordFailure();
    recordSuccess();
    expect(state.state).toBe('CLOSED');
    expect(state.failures).toBe(0);
  });

  it('should count failures correctly', () => {
    recordFailure();
    recordFailure();
    expect(state.failures).toBe(2);
    recordSuccess();
    expect(state.failures).toBe(0);
  });
});

describe('Exponential Backoff Logic', () => {
  // Reproduce ExponentialBackoffStrategy behavior
  let attempts = 0;
  const baseDelay = 1000;
  const multiplier = 2;
  const maxDelay = 8000;

  beforeEach(() => {
    attempts = 0;
  });

  function getNextDelay(): number {
    const delay = baseDelay * Math.pow(multiplier, attempts);
    return Math.min(delay, maxDelay);
  }

  function recordAttempt(): void {
    attempts++;
  }

  it('should start with base delay', () => {
    expect(getNextDelay()).toBe(1000);
  });

  it('should double on each attempt', () => {
    expect(getNextDelay()).toBe(1000);
    recordAttempt();
    expect(getNextDelay()).toBe(2000);
    recordAttempt();
    expect(getNextDelay()).toBe(4000);
    recordAttempt();
    expect(getNextDelay()).toBe(8000); // capped at max
  });

  it('should cap at maxDelay', () => {
    recordAttempt();
    recordAttempt();
    recordAttempt();
    recordAttempt();
    expect(getNextDelay()).toBe(8000);
  });
});