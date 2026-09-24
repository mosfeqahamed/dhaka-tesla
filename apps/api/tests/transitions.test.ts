import { describe, expect, it } from 'vitest';
import { poolStatus, requestStatus } from '../src/db/schema/index.js';
import {
  canTransitionPool,
  canTransitionRequest,
  REQUEST_TRANSITIONS,
} from '../src/modules/lifecycle/transitions.js';

describe('ride request state machine', () => {
  it('allows the happy path', () => {
    const path = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED'] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionRequest(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('allows cancelling until the trip starts, never after', () => {
    expect(canTransitionRequest('REQUESTED', 'CANCELLED')).toBe(true);
    expect(canTransitionRequest('MATCHED', 'CANCELLED')).toBe(true);
    expect(canTransitionRequest('DRIVER_ARRIVED', 'CANCELLED')).toBe(true);
    expect(canTransitionRequest('STARTED', 'CANCELLED')).toBe(false);
    expect(canTransitionRequest('COMPLETED', 'CANCELLED')).toBe(false);
  });

  it.each([
    ['COMPLETED', 'STARTED'],
    ['CANCELLED', 'REQUESTED'],
    ['REQUESTED', 'STARTED'],
    ['REQUESTED', 'COMPLETED'],
    ['MATCHED', 'COMPLETED'],
    ['STARTED', 'MATCHED'],
  ] as const)('rejects %s → %s', (from, to) => {
    expect(canTransitionRequest(from, to)).toBe(false);
  });

  it('treats COMPLETED and CANCELLED as final', () => {
    for (const to of requestStatus.enumValues) {
      expect(canTransitionRequest('COMPLETED', to)).toBe(false);
      expect(canTransitionRequest('CANCELLED', to)).toBe(false);
    }
  });

  it('never allows a status to transition to itself', () => {
    for (const s of Object.keys(REQUEST_TRANSITIONS) as (keyof typeof REQUEST_TRANSITIONS)[]) {
      expect(canTransitionRequest(s, s)).toBe(false);
    }
  });
});

describe('pool state machine', () => {
  it('allows the happy path', () => {
    expect(canTransitionPool('ACCEPTED', 'DRIVER_ARRIVED')).toBe(true);
    expect(canTransitionPool('DRIVER_ARRIVED', 'STARTED')).toBe(true);
    expect(canTransitionPool('STARTED', 'COMPLETED')).toBe(true);
  });

  it('cannot skip arrival or be cancelled mid-trip', () => {
    expect(canTransitionPool('ACCEPTED', 'STARTED')).toBe(false);
    expect(canTransitionPool('STARTED', 'CANCELLED')).toBe(false);
  });

  it('treats COMPLETED and CANCELLED as final', () => {
    for (const to of poolStatus.enumValues) {
      expect(canTransitionPool('COMPLETED', to)).toBe(false);
      expect(canTransitionPool('CANCELLED', to)).toBe(false);
    }
  });
});
