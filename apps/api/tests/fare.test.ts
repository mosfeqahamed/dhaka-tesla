import { describe, expect, it } from 'vitest';
import { calculateFare, percentOf } from '../src/modules/fares/fare.js';

// The worked examples from docs/pooling-and-fares.md, in paisa.
describe('fare model', () => {
  it('Nusrat, Banani → Mohakhali (2.0 km, 1 seat): ৳70 solo, ৳62 pooled', () => {
    expect(calculateFare({ distanceM: 2000, seats: 1, pooled: false })).toEqual({
      distanceM: 2000,
      seats: 1,
      baseFarePaisa: 3000,
      distanceChargePaisa: 4000,
      poolDiscountPaisa: 0,
      totalFarePaisa: 7000,
    });
    expect(calculateFare({ distanceM: 2000, seats: 1, pooled: true })).toMatchObject({
      poolDiscountPaisa: 800,
      totalFarePaisa: 6200,
    });
  });

  it('Rafiq, Banani → Gulshan 1 (3.0 km, 1 seat): ৳90 solo, ৳78 pooled', () => {
    expect(calculateFare({ distanceM: 3000, seats: 1, pooled: false }).totalFarePaisa).toBe(9000);
    expect(calculateFare({ distanceM: 3000, seats: 1, pooled: true })).toMatchObject({
      distanceChargePaisa: 6000,
      poolDiscountPaisa: 1200,
      totalFarePaisa: 7800,
    });
  });

  it('Shirin, Banani → Gulshan 1 with 2 seats: distance is charged per seat, base once', () => {
    expect(calculateFare({ distanceM: 3000, seats: 2, pooled: false })).toMatchObject({
      baseFarePaisa: 3000,
      distanceChargePaisa: 12000,
      totalFarePaisa: 15000,
    });
  });

  it('Jashim earns more from the pooled trip than from either solo ride', () => {
    const nusrat = calculateFare({ distanceM: 2000, seats: 1, pooled: true }).totalFarePaisa;
    const rafiq = calculateFare({ distanceM: 3000, seats: 1, pooled: true }).totalFarePaisa;
    expect(nusrat + rafiq).toBe(14000);
  });

  it('rounds the discount to the nearest paisa using integers only', () => {
    expect(percentOf(2002, 20)).toBe(400); // 400.4
    expect(percentOf(2004, 20)).toBe(401); // 400.8
    expect(percentOf(250, 20)).toBe(50);
    expect(percentOf(5, 50)).toBe(3); // 2.5 rounds half up
  });

  it('always returns whole paisa that add up', () => {
    for (const distanceM of [1, 999, 1001, 2500, 17_500]) {
      for (const seats of [1, 2, 3]) {
        for (const pooled of [false, true]) {
          const f = calculateFare({ distanceM, seats, pooled });
          expect(Number.isInteger(f.totalFarePaisa)).toBe(true);
          expect(f.totalFarePaisa).toBe(
            f.baseFarePaisa + f.distanceChargePaisa - f.poolDiscountPaisa,
          );
          expect(f.poolDiscountPaisa).toBeLessThanOrEqual(f.distanceChargePaisa);
        }
      }
    }
  });

  it('rejects nonsense input instead of producing a fare', () => {
    expect(() => calculateFare({ distanceM: 0, seats: 1, pooled: false })).toThrow(RangeError);
    expect(() => calculateFare({ distanceM: 2000, seats: 0, pooled: false })).toThrow(RangeError);
    expect(() => calculateFare({ distanceM: 20.5, seats: 1, pooled: false })).toThrow(RangeError);
  });
});
