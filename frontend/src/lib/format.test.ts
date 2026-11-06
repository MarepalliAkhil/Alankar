import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  formatDay,
  formatDuration,
  formatDurationRange,
  formatINR,
  formatTime,
  shopLocalToIso,
} from './format';

describe('format helpers', () => {
  it('formats rupees without paise', () => {
    expect(formatINR('1500.00')).toBe('₹1,500');
    expect(formatINR(15000)).toBe('₹15,000');
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDurationRange(45, 45)).toBe('45 min');
    expect(formatDurationRange(45, 75)).toBe('45 min – 1 h 15 min');
  });

  it('shows times in the shop time zone', () => {
    expect(formatTime('2026-10-27T10:00:00Z')).toMatch(/3:30\s?pm/i);
    expect(formatDateTime('2026-10-27T10:00:00Z')).toMatch(/27 Oct/);
    expect(formatDay('2026-10-27')).toMatch(/Tue.*27 Oct/);
    expect(shopLocalToIso('2026-10-27T15:30')).toBe('2026-10-27T15:30:00+05:30');
  });
});
