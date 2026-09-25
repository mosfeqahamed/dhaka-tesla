import { describe, expect, it } from 'vitest';
import { canCancel, isFinished, stepIndex } from './status';

describe('ride status helpers', () => {
  it('offers cancel exactly when the API allows it (before the trip starts)', () => {
    expect(canCancel('REQUESTED')).toBe(true);
    expect(canCancel('MATCHED')).toBe(true);
    expect(canCancel('DRIVER_ARRIVED')).toBe(true);
    expect(canCancel('STARTED')).toBe(false);
    expect(canCancel('COMPLETED')).toBe(false);
    expect(canCancel('CANCELLED')).toBe(false);
  });

  it('stops polling finished rides', () => {
    expect(isFinished('COMPLETED')).toBe(true);
    expect(isFinished('CANCELLED')).toBe(true);
    expect(isFinished('STARTED')).toBe(false);
  });

  it('orders the steps', () => {
    expect(stepIndex('REQUESTED')).toBe(0);
    expect(stepIndex('COMPLETED')).toBe(4);
  });
});
