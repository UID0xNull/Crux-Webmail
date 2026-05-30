// ------------------------------------------------------------------
// useAnimations — custom animation hooks for the micro-interaction system
// ------------------------------------------------------------------
import { useCallback, useState } from 'react';

/**
 * Hook to manage a single animation state (boolean toggle).
 */
export function useAnimationState(initial = false) {
  const [active, setActive] = useState(initial);
  const trigger = useCallback(() => {
    setActive(true);
    setTimeout(() => setActive(false), 300);
  }, []);
  return { active, trigger };
}

/**
 * Hook to track hover state with a delay before "enter" fires.
 */
export function useHoverState(delay = 150) {
  const [hovering, setHovering] = useState(false);
  let timer: ReturnType<typeof setTimeout>;

  const onMouseEnter = useCallback(() => {
    clearTimeout(timer);
    timer = setTimeout(() => setHovering(true), delay);
  }, [delay]);

  const onMouseLeave = useCallback(() => {
    clearTimeout(timer);
    setHovering(false);
  }, []);

  return { hovering, onMouseEnter, onMouseLeave };
}

/**
 * Hook to track click/tap animation state.
 */
export function useClickAnimation() {
  const [pressed, setPressed] = useState(false);
  const onPress = useCallback(() => setPressed(true), []);
  const onRelease = useCallback(() => setPressed(false), []);
  return { pressed, onPress, onRelease };
}

/**
 * Hook to track focus state for elements.
 */
export function useFocusState() {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false)
  };
}