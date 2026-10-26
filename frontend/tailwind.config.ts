import type { Config } from 'tailwindcss';
import { tailwindTheme } from './src/design/tokens';

// Colours, radii and shadows come ONLY from design tokens (theme replaced, not extended),
// so pages cannot use hard-coded palette colours like "bg-white" or "text-gray-500".
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: tailwindTheme.colors,
    borderRadius: tailwindTheme.borderRadius,
    boxShadow: tailwindTheme.boxShadow,
    fontFamily: tailwindTheme.fontFamily,
    extend: {
      spacing: tailwindTheme.spacing,
      zIndex: tailwindTheme.zIndex,
      transitionDuration: tailwindTheme.transitionDuration,
      transitionTimingFunction: tailwindTheme.transitionTimingFunction,
      backdropBlur: tailwindTheme.backdropBlur,
    },
  },
  plugins: [],
} satisfies Config;
