import { beforeEach, describe, expect, it } from 'vitest';
import {
  AIR_POSES,
  alreadyShown,
  isNightInIndia,
  markShown,
  poseFor,
  readMuted,
  writeMuted,
} from './air-data';

beforeEach(() => window.localStorage.clear());

describe('air-data', () => {
  it('names the thirteen owner files exactly', () => {
    expect(Object.values(AIR_POSES)).toEqual([
      'air-01-welcome',
      'air-02-idle',
      'air-03-explain',
      'air-04-point-right',
      'air-05-report',
      'air-06-thumbs-up',
      'air-07-thinking',
      'air-08-attention',
      'air-09-concerned',
      'air-10-celebrate',
      'air-11-on-call',
      'air-12-handover',
      'air-13-sleep',
    ]);
  });

  it('picks the pose for each moment and mood', () => {
    expect(poseFor('greeting')).toBe('welcome');
    expect(poseFor('loading')).toBe('thinking');
    expect(poseFor('speaking')).toBe('explain');
    expect(poseFor('pointing')).toBe('point-right');
    expect(poseFor('handover')).toBe('handover');
    expect(poseFor('error')).toBe('concerned');
    expect(poseFor('night-cover')).toBe('sleep');
    expect(poseFor('day-cover')).toBe('on-call');
    expect(poseFor('mood', 'attention')).toBe('attention');
    expect(poseFor('mood', 'concerned')).toBe('concerned');
    expect(poseFor('mood', 'celebrate')).toBe('celebrate');
    expect(poseFor('mood', 'idle')).toBe('idle');
    expect(poseFor('mood', 'report', { links_paid: 2, needs_you: 0 })).toBe('thumbs-up');
    expect(poseFor('mood', 'report', { links_paid: 2, needs_you: 1 })).toBe('report');
  });

  it('knows night in India', () => {
    expect(isNightInIndia(new Date('2026-11-08T16:00:00Z'))).toBe(true); // 21:30 IST
    expect(isNightInIndia(new Date('2026-11-08T05:00:00Z'))).toBe(false); // 10:30 IST
    expect(isNightInIndia(new Date('2026-11-08T01:00:00Z'))).toBe(true); // 06:30 IST
  });

  it('remembers mute and "shown this session" per user', () => {
    expect(readMuted('u1')).toBe(false);
    writeMuted('u1', true);
    expect(readMuted('u1')).toBe(true);
    expect(readMuted('u2')).toBe(false);
    expect(alreadyShown('u1', 'a')).toBe(false);
    markShown('u1', 'a');
    expect(alreadyShown('u1', 'a')).toBe(true);
    expect(alreadyShown('u1', 'b')).toBe(false);
  });
});
