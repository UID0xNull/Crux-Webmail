'use client';

import { createContext, useContext, useState, useCallback } from 'react';

type FocusTarget = 'message' | 'sidebar' | 'none';

interface FocusModeState {
  target: FocusTarget;
  activate: (t: FocusTarget) => void;
  deactivate: () => void;
}

export const FocusModeContext = createContext<FocusModeState>({
  target: 'none',
  activate: () => {},
  deactivate: () => {}
});

/**
 * Provider that enables focus mode — blurs all secondary areas.
 */
export function FocusModeProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<FocusTarget>('none');

  const activate = useCallback((t: FocusTarget) => setTarget(t), []);
  const deactivate = useCallback(() => setTarget('none'), []);

  return (
    <FocusModeContext.Provider value={{ target, activate, deactivate }}>
      {children}
    </FocusModeContext.Provider>
  );
}

export function useFocusMode() {
  return useContext(FocusModeContext);
}