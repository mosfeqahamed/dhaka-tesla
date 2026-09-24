// The story cast and Dhaka geography. Distances are curated, rounded
// approximations chosen so fares can be checked by hand - not real routing.
// The three story distances (docs/pooling-and-fares.md) are the ones that matter:
//   Banani -> Mohakhali 2.0 km, Banani -> Gulshan 1 3.0 km, Mohakhali <-> Gulshan 1 2.5 km

export const ZONES = [
  { name: 'Banani', lat: '23.793700', lng: '90.406600' },
  { name: 'Gulshan 1', lat: '23.780600', lng: '90.416300' },
  { name: 'Gulshan 2', lat: '23.794900', lng: '90.414300' },
  { name: 'Mohakhali', lat: '23.778000', lng: '90.405000' },
  { name: 'Farmgate', lat: '23.757700', lng: '90.390000' },
  { name: 'Dhanmondi', lat: '23.746100', lng: '90.374200' },
  { name: 'Mirpur 10', lat: '23.806900', lng: '90.368700' },
  { name: 'Uttara', lat: '23.875900', lng: '90.379500' },
  { name: 'Bashundhara', lat: '23.819300', lng: '90.452600' },
] as const;

export type ZoneName = (typeof ZONES)[number]['name'];

// One direction per pair; the seed inserts both directions.
export const DISTANCES_M: ReadonlyArray<[ZoneName, ZoneName, number]> = [
  ['Banani', 'Gulshan 1', 3000],
  ['Banani', 'Gulshan 2', 1500],
  ['Banani', 'Mohakhali', 2000],
  ['Banani', 'Farmgate', 5500],
  ['Banani', 'Dhanmondi', 8000],
  ['Banani', 'Mirpur 10', 6000],
  ['Banani', 'Uttara', 11000],
  ['Banani', 'Bashundhara', 6500],
  ['Gulshan 1', 'Gulshan 2', 2000],
  ['Gulshan 1', 'Mohakhali', 2500],
  ['Gulshan 1', 'Farmgate', 5500],
  ['Gulshan 1', 'Dhanmondi', 8000],
  ['Gulshan 1', 'Mirpur 10', 8000],
  ['Gulshan 1', 'Uttara', 12500],
  ['Gulshan 1', 'Bashundhara', 6500],
  ['Gulshan 2', 'Mohakhali', 3000],
  ['Gulshan 2', 'Farmgate', 6500],
  ['Gulshan 2', 'Dhanmondi', 9000],
  ['Gulshan 2', 'Mirpur 10', 7000],
  ['Gulshan 2', 'Uttara', 11000],
  ['Gulshan 2', 'Bashundhara', 5000],
  ['Mohakhali', 'Farmgate', 3500],
  ['Mohakhali', 'Dhanmondi', 6000],
  ['Mohakhali', 'Mirpur 10', 6000],
  ['Mohakhali', 'Uttara', 12000],
  ['Mohakhali', 'Bashundhara', 8000],
  ['Farmgate', 'Dhanmondi', 3000],
  ['Farmgate', 'Mirpur 10', 6000],
  ['Farmgate', 'Uttara', 15000],
  ['Farmgate', 'Bashundhara', 11000],
  ['Dhanmondi', 'Mirpur 10', 7500],
  ['Dhanmondi', 'Uttara', 17500],
  ['Dhanmondi', 'Bashundhara', 13500],
  ['Mirpur 10', 'Uttara', 10500],
  ['Mirpur 10', 'Bashundhara', 11500],
  ['Uttara', 'Bashundhara', 9000],
];

// Fictional contact details: .test is a reserved TLD, and the phone
// numbers are sequential placeholders, not real subscribers.
export const PASSENGERS = [
  { name: 'Nusrat', email: 'nusrat@teslapool.test', phone: '+8801700000101' },
  { name: 'Rafiq', email: 'rafiq@teslapool.test', phone: '+8801700000102' },
  { name: 'Shirin', email: 'shirin@teslapool.test', phone: '+8801700000103' },
] as const;

export const DRIVER = { name: 'Jashim', email: 'jashim@teslapool.test', phone: '+8801700000201' };

export const BULLET = {
  name: 'Bullet',
  plateNo: 'DHAKA-TESLA-0841',
  capacity: 3,
  homeZone: 'Banani' satisfies ZoneName,
};
