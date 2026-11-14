# DoctorLoop AI — agent notes

@AGENTS.md

- Read `docs/ARCHITECTURE.md` before writing code: module contracts, file ownership, access rules, scope rules.
- Shared contracts (additive changes only): `src/lib/domain/types.ts`, `src/lib/ai/schemas.ts`, `src/lib/data/repository.ts`, `src/lib/config/env.ts`, `src/lib/errors.ts`.
- Next.js 16.4 (`cacheComponents` off, async `params`/`cookies()`, `src/proxy.ts` instead of middleware). Check `node_modules/next/dist/docs/` when unsure.
- shadcn/ui (radix-nova) components are in `src/components/ui`; read the file for exact exports before using one.
- Synthetic data only. Label AI output as unverified. No diagnosis, triage, risk scores or emergency alerts.
- Verify: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
