# Orizenn Feedback Intelligence Platform

Create dynamic student feedback forms, share them through a unique link, collect responses, and get a dashboard generated from the questions you actually asked. Export everything to Excel.

**Stack:** Next.js 16 (App Router, Server Actions, Route Handlers) · React 19 · Tailwind CSS v4 · PostgreSQL · Prisma 7 · Zod 4 · Auth.js v5 · ExcelJS · Recharts · Vitest · Playwright · TypeScript strict.

```
Create Campaign → Reuse / New / AI form → Builder → Preview → Publish
      → Unique link → Students submit → Dynamic dashboard → AI insights → Excel export
```

## 1. Setup

Requirements: Node 22+, a PostgreSQL database (hosted is fine: Neon, Supabase, Railway…).

```bash
npm install
cp .env.example .env        # then edit .env
```

Fill in `.env`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Postgres URL used at runtime |
| `DIRECT_DATABASE_URL` | Optional non-pooled URL for migrations (Neon/Supabase poolers need this) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `http://localhost:3000` in dev |
| `AI_PROVIDER` | `stub` (deterministic, no vendor key). Add a real provider in `src/lib/ai/provider.ts` |
| `NEXT_PUBLIC_FEEDBACK_URL` | Base URL used in shareable links |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | First super admin created by the seed |
| `SEED_DEMO` | `true` seeds a demo campaign with 40 synthetic responses (development only) |

Then:

```bash
npm run db:migrate          # applies prisma/migrations, creates the schema
npm run db:seed             # workspace, super admin, 3 templates (+ demo if SEED_DEMO=true)
npm run dev                 # http://localhost:3000 → /login
```

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, then change the password by creating a new user in Settings.

## 2. Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (core-web-vitals + TypeScript) |
| `npm test` | Vitest: unit + integration (integration skips without `RUN_DB_TESTS=true`) |
| `npm run test:unit` | Pure unit tests, no DB |
| `RUN_DB_TESTS=true npm run test:integration` | DB-backed product-loop, authorization and publish-transaction tests against `DATABASE_URL` (uses a throwaway workspace) |
| `npm run test:e2e` | Playwright (needs a running app + `E2E_FORM_SLUG` for the public-form spec) |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Prisma |

## 3. Architecture

```
src/
├── app/
│   ├── page.tsx                    marketing intro
│   ├── login/                      Auth.js credentials login
│   ├── admin/                      AdminShell (sidebar, header, mobile bottom nav)
│   │   ├── page.tsx                KPIs + recent campaigns
│   │   ├── campaigns/              list · new · [campaignId]/
│   │   │   ├── (tabs)/             overview · responses · analytics · versions · export · settings
│   │   │   ├── builder/            form builder (drafts only)
│   │   │   └── source/             choose: previous form · template · blank · AI
│   │   ├── templates/  students/  exports/  settings/
│   ├── (bare)/admin/campaigns/[id]/preview   student-form preview, same renderer, no admin chrome
│   ├── f/[slug]/                   public student form + success
│   └── api/                        Route Handlers (standard {success,data|error} envelope)
├── actions/                        Server Actions (auth → authorize → Zod → service)
├── components/                     layout · ui · campaign · builder · feedback · analytics · export
└── lib/                            domain layer, no React
    ├── db/client.ts                Prisma singleton (pg adapter)
    ├── auth/session.ts             requireActor(), requireActorOrRedirect()
    ├── security/authz.ts           role → permission matrix, workspace isolation
    ├── validation/                 Zod: campaign · question · submission · filters · export
    ├── forms/                      definitions (types) · mapper · clone · publish-check · compare · service
    ├── questions/service.ts        add/edit/delete/duplicate/reorder (drafts only)
    ├── submissions/                submit (gates, throttle, idempotency) · privacy masking · list/detail
    ├── analytics/                  engine · metrics · question-analyzers/* · load (Prisma aggregation)
    ├── exports/                    excel.ts (pure workbook builder) · service.ts
    ├── ai/                         provider interface · stub · prompts/* · service (Zod-validated, cross-checked)
    └── templates/ workspace/ audit/
prisma/
├── schema.prisma                   16 models, enums, indexes
├── migrations/                     version-controlled SQL
└── seed.ts
tests/
├── unit/                           analytics, validation, forms, exports, ai, security, components (jsdom)
├── integration/                    DB-backed product loop, authorization, publish transaction
└── e2e/                            Playwright public-form spec
```

### Critical rules the code follows

- **Questions are data.** `QuestionRenderer` dispatches on `question.type`; the dashboard dispatches on `block.kind` derived from `analyticsType`. Nothing keys on question text or position.
- **Published versions are immutable.** Every question mutation goes through `assertDraft()`. Changing a published form means cloning into a new draft (`createDraftVersion`) and publishing that; old responses stay attached to the old version.
- **Deterministic numbers, AI for language.** Counts, averages, distributions and themes-by-keyword come from `lib/analytics`. The AI provider only suggests questions, reviews wording and writes summaries; its output is Zod-validated and `crossCheck()` drops any number or quote not present in the deterministic data.
- **Authorization at the data layer.** Every service takes an `Actor`, asserts a permission, and checks `workspaceId` on the loaded resource. Response mode (identified / pseudonymous / anonymous) is applied by `presentRespondent()` before data leaves the server.
- **One filter query.** `submissionWhere()` is shared by the dashboard, response explorer and Excel export, so the filtered export is exactly the filtered dataset.
- **Public submissions are untrusted.** The server loads the published definition from Postgres and validates every answer against it; unknown question ids, wrong types and out-of-range values are rejected. Honeypot, per-fingerprint throttling, client-token idempotency and response limits are enforced in `submitResponse()`.

## 4. Adding a real AI provider

Implement `AIProvider` from `src/lib/ai/types.ts` (four methods), register it in `getAIProvider()` and set `AI_PROVIDER=<name>` with `AI_API_KEY`. Prompts live in `src/lib/ai/prompts/`. Output must satisfy the Zod schemas in `types.ts`; anything else is rejected and the UI shows "AI result couldn't be used."

## 5. Deployment notes

- Run `npm run db:deploy` (prisma migrate deploy) before starting the new build.
- Use a pooled `DATABASE_URL` for the app and a direct `DIRECT_DATABASE_URL` for migrations on serverless Postgres.
- The rate limiter is in-process; behind multiple instances swap `src/lib/security/rate-limit.ts` for a shared store with the same signature.
- Never expose secrets through `NEXT_PUBLIC_*`.
