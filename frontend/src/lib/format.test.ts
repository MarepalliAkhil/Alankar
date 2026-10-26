import { describe, expect, it } from 'vitest';
import { formatDuration, formatDurationRange, formatINR } from './format';

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
});
