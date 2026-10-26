import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Swappable design system: no inline styles anywhere in JSX.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style']",
          message: 'No inline styles. Use design tokens through Tailwind classes or ui components.',
        },
      ],
    },
  },
  {
    // Pages must not hard-code colours; use tokens via ui components / Tailwind classes.
    files: ['src/pages/**/*.{ts,tsx}', 'src/components/layout/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style']",
          message: 'No inline styles. Use design tokens through Tailwind classes or ui components.',
        },
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b|rgba?\\(/]',
          message: 'No hard-coded colours in pages. Use design tokens.',
        },
      ],
    },
  },
);
