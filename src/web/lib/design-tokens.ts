// =================================================================
// Crux Webmail — Design Tokens v2.0
//
// Centralized visual system: colors, spacing, typography, shadows
// and border-radius for consistent UI across all components.
//
// Usage: import { COLORS, SHADOWS, TYPOGRAPHY, RADIUS } from './design-tokens'
// =================================================================

// -----------------------------------------------------------------
// Colors (modern indigo-slate palette — refined for contemporary UI)
// -----------------------------------------------------------------
export const COLORS = {
  // --- Primary family (deep indigo #4F6EF7 → trust & focus) ---
  primary:       '#505CF0',    // main brand color (refined, slightly brighter)
  primaryLight:  '#818CF8',    // lighter variant — hover, disabled bg
  primaryDark:   '#3B5AD0',    // darker variant — active/pressed state
  primarySubtle: 'rgba(80,92,240,.1)',
  primarySurface:'rgb(238,244,255)',

  // --- Accent family (soft emerald for subtle emphasis) ---
  accent:        '#14A96B',     // softer emerald for a more refined feel
  accentLight:   '#38E7CE',

  // --- Backgrounds (warm neutral scale — no more cool blue tint) ---
  bgPage:        '#F1F5F9',     // slightly cooler neutral, cleaner
  bgCard:        '#FFFFFF',     // card / panel surface
  bgSubtle:      'rgba(10,10,20,.04)',     // subtle interactive surfaces
  bgMuted:       '#E2E8F0',     // secondary panels (sidebar header) — refined shade

  // --- Text hierarchy ---
  textTitle:     '#0F172A',    // deeper, slightly cooler black (#1e293b equivalent)
  textPrimary:   '#334155',    // regular body text
  textBody:      '#64748B',    // secondary copy — more readable slate shade
  textMuted:     '#94A3B8',    // labels, placeholders, inactive icons (softer slate)
  textDisabled:  '#CBD5E0',    // disabled elements

  // --- Semantic colors ---
  success:       '#14B8A6',          // teal-500 — more natural than pure green
  successLight:  'rgba(20,184,166,.1)',
  warning:       '#F59E0B',          // warm amber for notices (unchanged)
  error:         '#EF4444',           // red for actions / danger (unchanged)
  urgent:        '#DC2626',             // bright red for high-priority flags
} as const;

// -----------------------------------------------------------------
// Spacing (8px grid)
// -----------------------------------------------------------------
export const SPACING = {
  xs:  '4px',
  sm:  '8px',   // micro spacing between icons and labels
  md:  '16px',  // component padding
  lg:  '24px',  // section gaps
  xl:  '32px',  // layout spacing
} as const;

// -----------------------------------------------------------------
// Border radius — consistent across all components
// -----------------------------------------------------------------
export const RADIUS = {
  sm:   '8px',     // small (chips, buttons)
  md:   '10px',    // standard (cards, panels) — default
  lg:   '14px',    // large (modals, dropdowns)
  xl:   '20px',    // extra-large (containers)
  full: '9999px',
} as const;

// -----------------------------------------------------------------
// Shadows — subtle elevation system (no heavy drop shadows)
// -----------------------------------------------------------------
export const SHADOWS = {
  xs: '0 1px 3px rgba(0,0,0,.04), 0 1px 2px -1px rgba(0,0,0,.04)',    // inline elements
  sm: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px -1px rgba(0,0,0,.05)',     // buttons, chips
  md: '0 4px 6px rgba(0,0,0,.07), 0 2px 3px -1px rgba(0,0,0,.05)',     // cards, panels (default)
  lg: '0 10px 25px rgba(0,0,0,.08), 0 6px 12px -4px rgba(0,0,0,.06)',   // modals, flyouts
}

// -----------------------------------------------------------------
// Typography — Inter font stack (loaded via <style> in layout)
// -----------------------------------------------------------------
export const TYPOGRAPHY = {
  fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontSizes: {
    xs: '12px',     // tiny labels, timestamps
    sm: '13px',     // body copy (message list)
    md: '15px',     // main content
    lg: '17px',     // headings in cards
  },
} as const;

// -----------------------------------------------------------------
// Tailwind config hook — export so next.config can use it
// -----------------------------------------------------------------
export const TAILWIND_COLORS = [
  { name: 'primary',       color: COLORS.primary       },
  { name: 'accent',        color: COLORS.accent        },
  { name: 'text-title',    color: COLORS.textTitle     },
  { name: 'text-primary',  color: COLORS.textPrimary   },
  { name: 'bg-page',       color: COLORS.bgPage         },
] as const;

export { SPACING, SHADOWS, RADIUS };

// -----------------------------------------------------------------
// TRANSITIONS — micro-animation timing curves (CSS transitions)
// -----------------------------------------------------------------
export const TRANSITIONS = {
  fast: '100ms ease',
  normal: '200ms ease',   // hover states, button presses
  slow: '300ms ease',     // expand/collapse panels
} as const;