import { beforeEach, describe, expect, it } from 'vitest';
import { userFor } from '../test/session';
import { destinationAfterLogin } from './destination';
import { isBookingPath, pendingBooking, rememberBooking } from './pending-booking';

describe('where sign-in leads', () => {
  beforeEach(() => sessionStorage.clear());

  it('always sends a customer to the dashboard, whatever next says', () => {
    const customer = userFor('customer');
    for (const next of [
      null,
      '/customer/invoices',
      '//evil.example.com',
      'https://x.y',
      '/staff',
    ]) {
      expect(destinationAfterLogin(customer, next, false)).toBe(customer.home);
    }
    expect(destinationAfterLogin(customer, null, true)).toBe(customer.home);
    expect(pendingBooking()).toBe('/customer/book');
  });

  it('remembers only the booking sheet, never another address', () => {
    const customer = userFor('customer');
    destinationAfterLogin(customer, '/customer/book?service=spa', false);
    expect(pendingBooking()).toBe('/customer/book?service=spa');
    sessionStorage.clear();
    destinationAfterLogin(customer, '/customer/bookings-evil', false);
    expect(pendingBooking()).toBeNull();
    rememberBooking('https://evil.example.com/customer/book');
    expect(pendingBooking()).toBeNull();
    expect(isBookingPath('/customer/book')).toBe(true);
    expect(isBookingPath('//customer/book')).toBe(false);
  });

  it('keeps the staff rule: a safe in-app page the role may open, else home', () => {
    const admin = userFor('admin');
    expect(destinationAfterLogin(admin, '/staff', false)).toBe('/staff');
    expect(destinationAfterLogin(admin, '//evil.example.com', false)).toBe(admin.home);
    expect(destinationAfterLogin(admin, '/customer-dashboard', false)).toBe(admin.home);
  });
});
