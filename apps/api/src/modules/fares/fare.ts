// The fare model from docs/pooling-and-fares.md. Pure functions, integer
// paisa only (৳1 = 100 paisa), so every result can be checked by hand.
//
//   baseFare       = 3000                               once per request
//   distanceCharge = distance_m × 2 × seats             ৳20 per km per seat
//   poolDiscount   = round(distanceCharge × 20%)        only when pooled
//   total          = baseFare + distanceCharge − poolDiscount

export const BASE_FARE_PAISA = 3000;
export const RATE_PAISA_PER_METRE = 2;
export const POOL_DISCOUNT_PERCENT = 20;

export interface FareInput {
  distanceM: number;
  seats: number;
  pooled: boolean;
}

export interface FareBreakdown {
  distanceM: number;
  seats: number;
  baseFarePaisa: number;
  distanceChargePaisa: number;
  poolDiscountPaisa: number;
  totalFarePaisa: number;
}

// Round-half-up percentage of an integer amount, without floating point.
export const percentOf = (amount: number, percent: number) =>
  Math.floor((amount * percent + 50) / 100);

export function calculateFare({ distanceM, seats, pooled }: FareInput): FareBreakdown {
  if (!Number.isInteger(distanceM) || distanceM <= 0) {
    throw new RangeError(`distanceM must be a positive integer, got ${distanceM}`);
  }
  if (!Number.isInteger(seats) || seats <= 0) {
    throw new RangeError(`seats must be a positive integer, got ${seats}`);
  }

  const distanceChargePaisa = distanceM * RATE_PAISA_PER_METRE * seats;
  const poolDiscountPaisa = pooled ? percentOf(distanceChargePaisa, POOL_DISCOUNT_PERCENT) : 0;

  return {
    distanceM,
    seats,
    baseFarePaisa: BASE_FARE_PAISA,
    distanceChargePaisa,
    poolDiscountPaisa,
    totalFarePaisa: BASE_FARE_PAISA + distanceChargePaisa - poolDiscountPaisa,
  };
}
