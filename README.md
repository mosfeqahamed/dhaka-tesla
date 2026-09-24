# Dhaka Tesla Pool

_Share a seat. Split the fare. Survive Dhaka traffic._

A ride-pooling MVP: passengers (Nusrat, Rafiq, Shirin) request rides from Dhaka zones, compatible
requests share one three-seat Tesla (Jashim's Bullet), and each passenger pays an individual,
hand-checkable fare.

> **Status:** in development. This README grows with each feature branch; the full version (setup,
> API overview, screenshots, deployment URL, AI usage, demo video) lands in `pre-release`.

## Design docs

| Doc                                                       | What's in it                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| [Architecture](docs/architecture.md)                      | System diagram, API layering, request flow, deployment             |
| [Database design](docs/erd.md)                            | ERD, every table explained, constraints and indexes                |
| [Ride & pool lifecycle](docs/ride-lifecycle.md)           | The two state machines, who can trigger what, cancellation rules   |
| [Pooling, fares & concurrency](docs/pooling-and-fares.md) | Matching rule, fare model with worked examples, the last-seat race |

## Quick start (current state)

Prerequisites: Node.js 22+, Docker with Compose v2.

```bash
cp .env.example .env        # then replace the placeholder values
npm install
docker compose up -d        # Postgres 16 with a healthcheck
npm run db:migrate -w @dhaka-tesla/api   # apply migrations in apps/api/drizzle
npm run db:seed -w @dhaka-tesla/api      # zones, distances, Jashim + Bullet, Nusrat, Rafiq, Shirin
npm run dev:api             # API on http://localhost:4000 — try GET /health
npm test                    # API tests (uses a separate <db>_test database)
```

Seeding is idempotent, so it is safe to re-run. All demo accounts use the `SEED_PASSWORD` from your
`.env`.

After changing the schema in `apps/api/src/db/schema/`, run
`npm run db:generate -w @dhaka-tesla/api` to create a new migration, review the generated SQL, and
commit it.

## Demo accounts

All seeded accounts use the `SEED_PASSWORD` from your `.env`.

| Who    | Role      | Email                   | Notes                           |
| ------ | --------- | ----------------------- | ------------------------------- |
| Nusrat | Passenger | `nusrat@teslapool.test` | Banani → Mohakhali in the story |
| Rafiq  | Passenger | `rafiq@teslapool.test`  | Banani → Gulshan 1              |
| Shirin | Passenger | `shirin@teslapool.test` | Wants 2 seats; only 1 is left   |
| Jashim | Driver    | `jashim@teslapool.test` | Drives Bullet (3 seats, Banani) |

## Authentication

- `POST /auth/register` (passengers only), `POST /auth/login`, `POST /auth/logout`, `GET /me`.
- Sessions are a signed JWT (HS256, `jose`) in an `HttpOnly; SameSite=Lax` cookie, `Secure` in
  production. Page scripts can't read it, and browsers won't send it on cross-site POSTs. The web app
  reaches the API through a same-origin proxy, so the cookie is never third-party.
- Drivers cannot self-register: a driver needs a Tesla with a plate and a fixed capacity, which the
  operator onboards (the seed, in the MVP).
- Passwords are hashed with bcrypt (cost 10). Login runs bcrypt even for unknown emails and returns
  the same error for both cases, so it doesn't reveal which emails are registered.
- Failed sign-in/sign-up attempts are rate-limited per IP (`AUTH_RATE_LIMIT` per 15 minutes).
- Duplicate emails/phones are caught by the database's unique constraints, not a pre-check, so two
  simultaneous sign-ups can't both succeed.
