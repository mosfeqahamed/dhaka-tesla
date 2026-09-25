// Shapes of the API's JSON responses (apps/api), as the web app uses them.

export type Role = 'PASSENGER' | 'DRIVER';

export type RideStatus =
  'REQUESTED' | 'MATCHED' | 'DRIVER_ARRIVED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';

export type PoolStatus = 'ACCEPTED' | 'DRIVER_ARRIVED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';

export type PaymentMethod = 'CASH' | 'TESLAPAY';

export interface Zone {
  id: number;
  name: string;
}

export interface Vehicle {
  id: string;
  name: string;
  plateNo: string;
  capacity: number;
  driverStatus: 'ONLINE' | 'OFFLINE';
  currentZoneId: number | null;
  currentZoneName: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  vehicle?: Vehicle | null;
}

export interface FareBreakdown {
  distanceM: number;
  seats?: number;
  baseFarePaisa: number;
  distanceChargePaisa: number;
  poolDiscountPaisa: number;
  totalFarePaisa: number;
}

export interface FareEstimate {
  solo: FareBreakdown;
  pooled: FareBreakdown;
}

export interface TimelineEvent {
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  at: string;
  by?: 'YOU' | 'DRIVER' | 'PASSENGER' | 'SYSTEM';
}

export interface Ride {
  id: string;
  status: RideStatus;
  seats: number;
  paymentMethod: PaymentMethod;
  estimatedFarePaisa: number;
  pickupZone: Zone;
  dropoffZone: Zone;
  createdAt: string;
  updatedAt: string;
  pool: {
    id: string;
    status: PoolStatus;
    seatsTaken: number;
    capacity: number;
    tesla: { name: string; plateNo: string };
    driverName: string;
    coRiders: number;
  } | null;
  fare: (FareBreakdown & { pooled: boolean }) | null;
  timeline?: TimelineEvent[];
}

export interface RidesPage {
  rides: Ride[];
  nextCursor: string | null;
}

// ---- driver side ----

export interface PoolPassenger {
  rideId: string;
  passengerName: string;
  status: RideStatus;
  seats: number;
  paymentMethod: PaymentMethod;
  pickupZone: Zone;
  dropoffZone: Zone;
  fare: FareBreakdown;
  joinedAt: string;
}

export interface DriverPool {
  id: string;
  status: PoolStatus;
  capacity: number;
  seatsTaken: number;
  seatsFree: number;
  pickupZone: Zone;
  tesla: { name: string; plateNo: string };
  passengers: PoolPassenger[];
  totalFarePaisa: number;
  createdAt: string;
  updatedAt: string;
  timeline?: TimelineEvent[];
}

export interface WaitingRequest {
  id: string;
  passengerName: string;
  seats: number;
  dropoffZone: Zone;
  estimatedFarePaisa: number;
  paymentMethod: PaymentMethod;
  waitingSince: string;
}

export interface DriverFeed {
  online: boolean;
  zone: Zone | null;
  currentPool: DriverPool | null;
  requests: WaitingRequest[];
}

export interface PoolsPage {
  pools: DriverPool[];
  nextCursor: string | null;
}

export type PoolAction = 'arrive' | 'start' | 'complete' | 'cancel';
