import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, useRouteTheme } from '../../design/display';
import { ThemeProvider, ThemeScope } from '../../design/ThemeProvider';
import { ArtImage } from './ArtImage';
import { DisplaySettings } from './DisplaySettings';
import { DelayedLoader, LOADER_DELAY_MS } from './Loader';

vi.mock('virtual:photo-manifest', () => ({ default: ['salon-background.jpg'] }));

function StaffPage() {
  useRouteTheme('staff');
  return <p>staff page</p>;
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dataset.mode = 'light';
  document.documentElement.dataset.theme = 'brand';
});

describe('display settings', () => {
  it('switches dark mode and remembers it in this browser', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <DisplaySettings />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole('button', { name: /Display/ }));
    expect(screen.getByRole('radio', { name: 'Use my device setting' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.mode).toBe('dark');
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ mode: 'dark' });
    await user.click(screen.getByRole('checkbox', { name: /Reduce transparency/ }));
    expect(document.documentElement.dataset.transparency).toBe('reduced');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a panel wide enough for its words, closes on outside click and Escape, and returns focus', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <p>outside</p>
        <DisplaySettings />
      </ThemeProvider>,
    );
    const button = screen.getByRole('button', { name: /Display/ });
    await user.click(button);
    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('min-w-[16rem]');
    expect(panel.className).not.toContain('max-w-full');
    await user.click(screen.getByText('outside'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(button);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('starts from the remembered choice', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'dark' }));
    render(
      <ThemeProvider>
        <p>page</p>
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.mode).toBe('dark');
  });

  it('a layout sets its theme while shown and gives it back afterwards', () => {
    const view = render(
      <ThemeProvider>
        <StaffPage />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('staff');
    view.rerender(
      <ThemeProvider>
        <p>public page</p>
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('brand');
  });

  it('a scope previews another theme and mode without changing the page', () => {
    render(
      <ThemeProvider>
        <ThemeScope theme="spa" mode="dark">
          <p>preview</p>
        </ThemeScope>
      </ThemeProvider>,
    );
    const scope = screen.getByText('preview').parentElement!;
    expect(scope.dataset.theme).toBe('spa');
    expect(scope.dataset.mode).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('brand');
  });
});

describe('loaders and images', () => {
  it('never shows the full-screen loader for a fast load', () => {
    vi.useFakeTimers();
    render(
      <ThemeProvider>
        <DelayedLoader />
      </ThemeProvider>,
    );
    act(() => vi.advanceTimersByTime(LOADER_DELAY_MS - 10));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    vi.useRealTimers();
  });

  it('uses the owner photo when there is one, and a plain gradient otherwise', () => {
    render(
      <ThemeProvider>
        <ArtImage slot="salonBackground" priority />
        <ArtImage slot="spaBackground" />
      </ThemeProvider>,
    );
    const salon = document.querySelector('[data-art-frame="salonBackground"] img')!;
    expect(salon).toHaveAttribute('src', '/photos/salon-background.jpg');
    expect(salon).toHaveAttribute('data-source', 'photo');
    expect(salon).toHaveAttribute('loading', 'eager');
    expect(salon).toHaveAttribute('width', '1600');
    expect(salon).toHaveAttribute('alt', '');
    expect(salon).toHaveAttribute('aria-hidden', 'true');
    const spa = document.querySelector('[data-art-frame="spaBackground"]')!;
    expect(spa).toHaveAttribute('data-source', 'gradient');
    expect(spa.querySelector('img')).toBeNull();
  });
});
