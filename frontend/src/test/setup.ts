import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';
import { applyTokens } from '../design/tokens';

beforeAll(() => {
  applyTokens();
});

afterEach(() => {
  cleanup();
});
