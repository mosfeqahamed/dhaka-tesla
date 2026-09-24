# Pooling, fares and concurrency

## Geography

No map APIs. The city is a fixed list of zones with curated road distances between them
(`zones` and `zone_distances`, seeded by the migration seed script). The values are rounded,
plausible approximations chosen to make fares easy to check by hand — **not** real routing data.

Distances used by the story:

| From      | To        | Distance |
| --------- | --------- | -------- |
| Banani    | Mohakhali | 2.0 km   |
| Banani    | Gulshan 1 | 3.0 km   |
| Mohakhali | Gulshan 1 | 2.5 km   |

The full matrix lives in the seed data. Two dropoffs in the same zone are 0 km apart.

## Matching rule

A new request **R** joins an existing pool **P** when all of these hold:

1. `P.status = ACCEPTED` — the driver has accepted but not yet arrived.
2. `P.pickup_zone_id = R.pickup_zone_id` — same pickup zone.
3. `P.seats_taken + R.seats <= P.capacity` — enough free seats.
4. **Route compatibility:** R's dropoff is within **3.0 km** of the dropoff of _every_ active member of
   P. This keeps any one passenger's detour bounded without real routing.

Candidate pools are tried oldest first, so existing pools fill up before new ones are started. If no
pool qualifies, R stays `REQUESTED` and appears in the feed of every online driver whose current zone
is R's pickup zone; a driver accepting it creates a new pool.

Assumption: every request is pool-eligible (this is a pooling app); a driver accepting a pool
consents to compatible passengers being added until they mark arrival.

**Applied to the story:**

- Nusrat: Banani → Mohakhali. No pool exists → `REQUESTED`. Jashim (online in Banani) accepts →
  Bullet's pool, 1/3.
- Rafiq: Banani → Gulshan 1. Same pickup ✔, 1 seat free ✔ (needs 1), Gulshan 1 ↔ Mohakhali 2.5 km ≤
  3.0 ✔ → joins, 2/3.
- Shirin: Banani → Gulshan 1 with **2 seats**. Route ✔ (0 km to Rafiq, 2.5 km to Nusrat) but only 1
  seat free ✘ → stays `REQUESTED` for another Tesla.

## Fare model

```
baseFare       = 3000 paisa                        (৳30, once per request)
distanceCharge = distance_m × 2 paisa × seats      (৳20 per km per seat)
poolDiscount   = round(distanceCharge × 20%)       (only if the pool has ≥ 2 active requests)
passengerFare  = baseFare + distanceCharge − poolDiscount
```

- Distance is always **pickup → the passenger's own dropoff**, not the Tesla's total route: you pay for
  your trip, not for someone else's detour.
- The discount applies to the distance charge only, so the base fare still covers the Tesla showing up.
- Rounding is to the nearest paisa, half up, using integer arithmetic only.
- **When fares change:** the request shows a solo estimate (`estimated_fare_paisa`) when it's created.
  Each member's breakdown in `pool_members` is recomputed whenever someone joins or leaves the pool,
  and **frozen when the pool starts**. Once in the Tesla, nobody's fare moves.

### Worked examples (check these by hand)

| Passenger | Trip                    | Seats | Base   | Distance charge        | Discount (pooled)  | Solo fare   | Pooled fare |
| --------- | ----------------------- | ----- | ------ | ---------------------- | ------------------ | ----------- | ----------- |
| Nusrat    | Banani → Mohakhali 2 km | 1     | ৳30.00 | 2000 × 2 × 1 = ৳40.00  | 20% of 40 = ৳8.00  | **৳70.00**  | **৳62.00**  |
| Rafiq     | Banani → Gulshan 1 3 km | 1     | ৳30.00 | 3000 × 2 × 1 = ৳60.00  | 20% of 60 = ৳12.00 | **৳90.00**  | **৳78.00**  |
| Shirin    | Banani → Gulshan 1 3 km | 2     | ৳30.00 | 3000 × 2 × 2 = ৳120.00 | —                  | **৳150.00** | —           |

In paisa: Nusrat `3000 + 4000 − 800 = 6200`, Rafiq `3000 + 6000 − 1200 = 7800`. Jashim collects
৳140.00 for the trip instead of the ৳70.00 or ৳90.00 a single solo ride would have paid.

If Rafiq cancels before the trip starts, Nusrat is alone again and Nusrat's fare goes back to ৳70.00 —
no one is charged a pooled price for a ride that wasn't pooled.

### Payment

The passenger picks Cash or TeslaPay when requesting. Both are simulated: completing the pool creates
one `payments` row per member for `total_fare_paisa`, marked `PAID`. No real gateway, no wallet
balance in the MVP.

## Concurrency: the last seat

**The problem.** Bullet has one seat left. Nusrat and Shirin both request at nearly the same instant.
Both read `seats_taken = 2, capacity = 3`, both conclude "one seat free", and both join: 4/3.

**What we do now: lock the pool row, then check.** Joining a pool is one transaction:

```sql
BEGIN;
-- 1. Lock the pool. A second transaction trying to lock the same row waits here.
SELECT * FROM pools WHERE id = $pool AND status = 'ACCEPTED' FOR UPDATE;

-- 2. With the lock held, re-check the rules against fresh data:
--    seats_taken + $seats <= capacity, route compatibility with current members.
--    If either fails → ROLLBACK to a savepoint and try the next candidate pool.

-- 3. Claim the seats and record membership.
UPDATE pools SET seats_taken = seats_taken + $seats WHERE id = $pool;
INSERT INTO pool_members (...);
UPDATE ride_requests SET status = 'MATCHED' WHERE id = $request AND status = 'REQUESTED';
-- recompute every member's fare breakdown
INSERT INTO status_events (...);
COMMIT;
```

The first transaction takes the lock, sees 2/3, claims the seat and commits (3/3). The second was
blocked on `FOR UPDATE`; when it gets the lock it reads the _committed_ row, sees 3/3, fails the seat
check and moves on — Shirin stays `REQUESTED`. Nobody is overbooked and nobody gets a 500.

Why lock first instead of a single `UPDATE … WHERE seats_taken + n <= capacity`? The conditional
update protects the seat count, but route compatibility depends on the _other members_. Two
passengers could each be compatible with Nusrat yet incompatible with each other; only a check made
while holding the lock sees both. Every operation that changes a pool's membership (join, cancel,
driver cancel) takes the same lock first, so membership changes on one pool are strictly serialised.

**Defence in depth.** Even if the service had a bug, the database refuses the bad write:

- `CHECK (seats_taken BETWEEN 0 AND capacity)` makes 4/3 impossible to commit.
- `UNIQUE (ride_request_id)` on `pool_members` stops one request joining twice.
- The partial unique index on active requests per passenger stops a double-tap creating two rides,
  and `Idempotency-Key` makes the retry return the original ride.

**Related races handled the same way:**

- Two drivers accept the same request: `UPDATE ride_requests SET status = 'MATCHED' WHERE id = $1
AND status = 'REQUESTED'` — the loser updates 0 rows and gets `409`.
- A passenger cancels while the driver presses Start: both lock the pool row; whichever commits
  second sees the new state and gets `409 INVALID_TRANSITION`.
- One driver accepting two requests at once: the partial unique index "one active pool per vehicle"
  rejects the second.

**Tested by** firing two join requests for the last seat concurrently (`Promise.all`) against a real
Postgres and asserting exactly one succeeds and `seats_taken` ends at `capacity`.

**What changes at scale.** A row lock per pool is cheap, and contention is limited to people joining
the _same_ Tesla at the same moment. At much larger scale the bottleneck becomes the single primary
database and the matching scan, not the lock. Next steps would be to partition matching by zone (one
matching worker or queue partition per zone, so seat claims for a zone are serialised without DB
contention), move candidate search to a geospatial index, and keep Postgres as the source of truth
for committed membership.
