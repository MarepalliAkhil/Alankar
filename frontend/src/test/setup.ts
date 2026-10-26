import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';
import { applyTokens } from '../design/tokens';

// Slower machines (e.g. Windows with antivirus) need more than the 1 s default
// for findBy*/waitFor to see async renders.
configure({ asyncUtilTimeout: 5000 });

beforeAll(() => {
  applyTokens();
});

afterEach(() => {
  cleanup();
});
