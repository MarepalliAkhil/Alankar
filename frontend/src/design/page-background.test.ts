import { describe, expect, it } from 'vitest';
import {
  BRAND_BACKGROUND,
  backgroundFor,
  setBookingDivision,
  useBookingDivision,
} from './page-background';
import { renderHook, act } from '@testing-library/react';

const brand = { slot: 'shopBackground', division: null };

describe('route to background mapping', () => {
  it('the home page paints its own background', () => {
    expect(backgroundFor('/', null)).toBeNull();
  });

  it.each([
    ['/salon', 'salonBackground', 'salon'],
    ['/spa', 'spaBackground', 'spa'],
    ['/beauty-parlor', 'parlorBackground', 'beauty-parlor'],
    ['/spa/', 'spaBackground', 'spa'],
  ])('%s shows the %s photo', (path, slot, division) => {
    expect(backgroundFor(path, null)).toEqual({ slot, division });
  });

  it.each([
    '/customer-dashboard',
    '/customer/appointments',
    '/customer/chat',
    '/customer/wallet',
    '/customer/packages',
    '/customer/gift-cards',
    '/customer/memberships',
    '/customer/shop',
    '/customer/orders',
    '/customer/invoices',
    '/customer/profile',
    '/profile',
    '/dashboard',
    '/appointments',
    '/schedule',
    '/customers',
    '/pos',
    '/cash-close',
    '/inventory',
    '/my-schedule',
    '/requests',
    '/payroll',
    '/staff',
    '/settings',
    '/login',
    '/register',
    '/zenotians',
    '/zenotians/day',
    '/privacy',
  ])('%s shows the Alankar reception photo', (path) => {
    expect(backgroundFor(path, null)).toEqual(brand);
    // a leftover booking choice never leaks onto other pages
    expect(backgroundFor(path, 'spa')).toEqual(brand);
  });

  it('the booking page follows the division being booked, and "All" shows Alankar', () => {
    expect(backgroundFor('/customer/book', 'salon')).toEqual({
      slot: 'salonBackground',
      division: 'salon',
    });
    expect(backgroundFor('/customer/book', 'spa')).toEqual({
      slot: 'spaBackground',
      division: 'spa',
    });
    expect(backgroundFor('/customer/book', 'beauty-parlor')).toEqual({
      slot: 'parlorBackground',
      division: 'beauty-parlor',
    });
    expect(backgroundFor('/customer/book', null)).toEqual(brand);
    expect(BRAND_BACKGROUND).toBe('shopBackground');
  });

  it('the booking division is shared through a small store', () => {
    const { result } = renderHook(() => useBookingDivision());
    expect(result.current).toBeNull();
    act(() => setBookingDivision('spa'));
    expect(result.current).toBe('spa');
    act(() => setBookingDivision(null));
    expect(result.current).toBeNull();
  });
});
