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
