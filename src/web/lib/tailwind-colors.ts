// Export all design tokens from the centralized config file.
// This file allows Tailwind and other modules to import { COLORS, SPACING, RADIUS }
import { COLORS, SPACING, RADIUS } from './design-tokens';

export const TAILWIND_COLORS = [
  { name: 'primary', color: COLORS.primary },
  { name: 'secondary', color: COLORS.accent },
  { name: 'text-title', color: COLORS.textTitle },
  { name: 'text-primary', color: COLORS.textPrimary },
  { name: 'text-body', color: COLORS.textBody },
  { name: 'bg-page', color: COLORS.bgPage },
  { name: 'bg-card', color: COLORS.bgCard },
];

export { COLORS, SPACING, RADIUS };