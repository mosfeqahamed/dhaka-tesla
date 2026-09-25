import { describe, expect, it } from 'vitest';
import { formatDistance, formatTaka } from './format';

describe('formatTaka', () => {
  it('shows paisa as taka without floating-point drift', () => {
    expect(formatTaka(6200)).toBe('৳62.00'); // Nusrat, pooled
    expect(formatTaka(7800)).toBe('৳78.00'); // Rafiq, pooled
    expect(formatTaka(805)).toBe('৳8.05');
    expect(formatTaka(0)).toBe('৳0.00');
    expect(formatTaka(1_250_000)).toBe('৳12,500.00');
    expect(formatTaka(-800)).toBe('−৳8.00');
  });
});

describe('formatDistance', () => {
  it('shows metres as km with one decimal', () => {
    expect(formatDistance(2000)).toBe('2.0 km');
    expect(formatDistance(2500)).toBe('2.5 km');
  });
});
