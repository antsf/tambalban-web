---
name: architect
description: Guide structural decisions for TambalBan Web against soul.md, CLAUDE.md's 9 locked rules, and the shared-schema impact on the sibling Android app.
---

# Skill: architect

Architectural decision-making for TambalBan Web.

---

## Purpose

Guide every structural decision — data flow, module boundaries, service choices, query patterns, state management — through the lens of this project's specific constraints: shared-database coordination with the sibling Android app, safety-critical accuracy for stranded drivers, admin-gated review (not community voting), and long-term maintainability by a small team. This skill is about **thinking through consequences**, not generating boilerplate.

---

## When to Invoke

- A new feature is being proposed and you need to reason about where it fits in the existing structure.
- An existing module is growing too large or has unclear ownership.
- A new dependency is being considered.
- Someone proposes something that feels architecturally wrong but you cannot articulate why.
- A decision will touch multiple layers (API + DB + UI) simultaneously.
- A "simple" request would require violating one of the 9 locked architectural rules in CLAUDE.md.
- A decision touches the `workshops` or `workshop_submissions` tables — anything shared with `../tambalban` needs extra scrutiny.

## When NOT to Invoke

- Styling or UI layout questions (use `design-system-review`, `design-director`).
- Performance tuning of existing code (use `bundle-review`).
- Writing a single utility function.

---

## Inputs

Before starting, answer these:

1. What is the **proposed change or feature** in plain language?
2. Which **existing modules** would it touch? (API routes under `src/app/api/`, `workshops`/`workshop_submissions` tables, `src/lib/*`, components)
3. Which **soul.md decision question** does this serve? (If none, that's a signal.)
4. Does this change **any of the 9 locked architectural rules** in `CLAUDE.md`?
5. Is this **in scope or explicitly out-of-scope** per `SPEC.md §10`?
6. Does this touch a table (`workshops`, `workshop_submissions`) that `../tambalban` (the Android app, Kotlin) also reads or writes?

If the answer to question 5 is "out of scope," stop. Do not architect it. Return the out-of-scope list to the requester and explain why. If the answer to question 6 is yes, flag that the Android side needs to be checked (`../tambalban/supabase_schema.sql`, `../tambalban/CLAUDE.md`) before proceeding — this repo does not own that schema unilaterally.

---

## Outputs

A written architectural decision containing:

- **Decision**: one sentence, what we're doing.
- **Why**: what problem it solves, which soul.md value it serves.
- **What changes**: which files/modules are added or modified.
- **What stays the same**: explicit call-out of boundaries not crossed.
- **Shared-schema impact**: does this touch `workshops`/`workshop_submissions`? If yes, what does the Android app need to know?
- **Risks**: what could go wrong with this approach.
- **Alternatives rejected**: what else was considered and why it was worse.
- **Exit criteria**: how we know the implementation is done and correct.

---

## Thinking Process

### Step 1 — Apply the soul.md filter first

Before any technical analysis, run the proposal through the four decision questions from `soul.md`:

```
1. Does this make a workshop findable faster in an emergency?
2. Does this keep the data accurate? (speed must never cost correctness)
3. Does this stay consistent with what the Android app reads? (one source of truth, two front doors)
4. Does this stay light and free to run?
```

A proposal that fails question 1 and cannot answer "it enables something that will" is suspect. Document this rather than rejecting outright — some infrastructure work genuinely doesn't touch findability directly but enables features that will.

### Step 2 — Check locked rules

Go through `CLAUDE.md`'s 9 locked architectural rules one by one. Not just the ones obviously related. Check all nine. Ask: "Does this change put pressure on any of these rules?"

Common pressure points in this project:
- New data field submitted → Does it need to reach `workshops` on approval? → Must flow through the existing approve step in `admin/submissions/[id]/route.ts`, not a new bypass path.
- New status or state → Is it in SPEC.md §5's `pending → approved | rejected` state machine? → Reject if it adds a third terminal state or an "un-reject" transition; that violates rule 4.
- New route touching `SUPABASE_SERVICE_ROLE_KEY` → Does it call `isAdmin()` first, and only from `/api/admin/*`? → Rule 2.
- New public route → Does it accidentally expose `workshop_submissions` data? → Rule 1 (submissions invisible until approved).
- New geo query → Is it still plain lat/lng comparison against `idx_workshops_location`, or does it silently introduce PostGIS without the Android schema adopting it first? → Rule 9.
- New auth-adjacent idea ("let contributors edit their own submission," "let contributors track their submission status") → Does it require identifying who submitted something? → That's user accounts, which do not exist here (rule 1 of "What NOT to Do": no Supabase Auth, no per-user accounts).

### Step 3 — Draw the data flow

Sketch the data path from user action to DB and back. Ask at each boundary:

- **Who calls this?** (browser — public or admin session, server component, API route)
- **What trust level does the caller have?** (public anonymous = untrusted; admin session = trusted, but still only as trusted as a shared password)
- **Where is validation?** A Zod schema (`src/lib/validation.ts`) must be the first thing that runs in every API route handling user input.
- **Where is rate limiting?** Public write/geocode routes must call `rateLimit()` (`src/lib/rate-limit.ts`) before doing anything expensive.
- **What does the DB return?** `GET /api/workshops` must never read from `workshop_submissions`. Only the two admin routes (`admin/submissions/route.ts`, `admin/submissions/[id]/route.ts`) touch that table, and only via `createAdminClient()`.

### Step 4 — Module boundary test

For each new file/module being proposed, apply this test:

> "Could a contributor who just discovered this repo in one day understand what this module does, modify it safely, and know what NOT to touch?"

If no: the boundary is wrong. Either it's doing too much, or it's named opaquely, or it depends on implicit context (especially implicit knowledge of the Android app's schema).

Prefer **flat over nested**. A utility function used once stays near its use site. Only promote to `src/lib/` when used by 2+ independent modules — this is already the pattern (`geo.ts`, `validation.ts`, `auth.ts`, `rate-limit.ts`, `format.ts`).

### Step 5 — Dependency cost analysis

For every new `npm install` being proposed:

| Question | Threshold |
|----------|-----------|
| What is the bundle size impact? | Question anything > 50kB gzipped |
| Is it maintained? (last commit?) | Reject if abandoned > 1 year |
| Does it replace something we already have? | Yes → use what we have |
| Is there a native Web API alternative? | Yes → use that instead |
| Does it require a paid tier for production use? | Reject immediately |
| Does it introduce a new config file? | Question whether the complexity is worth it |

This project uses: Next.js 16, React 19, `react-leaflet` + `leaflet`, `@supabase/supabase-js`, Zod 4, Tailwind CSS v4. These are **locked**. Do not replace them. Do not add a competing map library, validation library, or state management library alongside them.

### Step 6 — Contributor legibility

Every architectural decision must be evaluated from the perspective of:

- A developer who wants to add a significant feature.
- A developer fixing a small bug or UI issue.
- Whoever inherits this project later, per soul.md's "simple enough to run" value — one admin password, one Supabase project, no elaborate infrastructure.

Ask: "Does this change make the codebase harder for the next maintainer to run in a few minutes?" If yes, document the tradeoff explicitly.

---

## Decision Tree

```
Is it in SPEC.md's out-of-scope list (§10)?
  YES → Decline. Return SPEC.md §10.
  NO  ↓

Does it violate any of the 9 locked rules in CLAUDE.md?
  YES → Decline. Name the specific rule. Suggest a compliant alternative.
  NO  ↓

Does it fail all four soul.md decision questions?
  YES → Flag as misaligned. Ask requester to justify.
  NO  ↓

Does it touch `workshops` or `workshop_submissions`?
  YES → Flag that ../tambalban's schema/CLAUDE.md needs checking before implementation.
  NO  ↓

Does it add a new npm dependency?
  YES → Run dependency cost analysis (Step 5). Must pass all criteria.
  NO  ↓

Does it add a new API route?
  YES → Also run `api-review` and consider whether it needs rate limiting and/or `isAdmin()`.
  NO  ↓

Proceed to data flow sketch (Step 3) → Module boundary test (Step 4).
```

---

## Architecture Patterns for This Project

### Pattern: Server-First Data Fetching

Default pattern for all page-level data:

```
page.tsx (Server Component)
  └── renders a client component shell for anything needing Leaflet or form state
      └── the client component fetches from /api/* itself
```

The map page (`src/app/page.tsx`) is a server component that renders `MapPanel`, which dynamically imports `WorkshopMap` (`ssr: false`) — the map cannot know its viewport until Leaflet initializes in the browser, so client-side fetch-on-mount is the correct pattern here, not an anti-pattern to fix.

### Pattern: Submission → Review → Publish, Not Voting

The `workshop_submissions` → `workshops` pipeline is a **two-state admin-reviewed queue**, not a community-voted state machine. There is exactly one transition each way:

```
pending --(admin approves)--> approved  (INSERT into workshops, source: "web")
pending --(admin rejects)-->  rejected
```

Both `approved` and `rejected` are terminal by design (SPEC.md §5, CLAUDE.md rule 4) — this keeps the audit trail honest (`reviewed_at` always means "reviewed once, no take-backs through the app"). Do not propose vote thresholds, upvote/downvote counts, or multi-reviewer consensus — that's a different project's model (see `crowdsourcing-review` for the explicit contrast). If review capacity becomes a bottleneck, the fix is more admins with the shared password or a faster UI, not a voting system.

### Pattern: Geography as Plain Columns, Not PostGIS (Yet)

`workshops.latitude`/`workshops.longitude` are plain `double precision` columns backed by `idx_workshops_location` (a conventional B-tree-style index, not GIST). `getWorkshopsInBounds()` in `src/lib/geo.ts` does a `gte`/`lte` range query, not `ST_Within`. This is intentional and sufficient at current scale. CLAUDE.md rule 9 and SPEC.md §10 both call out that PostGIS is deferred until the table passes ~50k rows, **and** only if the Android app's schema adopts it too — this repo does not own `workshops` unilaterally and should not introduce a query pattern the Android app doesn't also use. See `geo-data-review` for the migration trigger.

### Pattern: Admin Auth is a Shared Secret, Not a User System

`ADMIN_PASSWORD` + HMAC-signed session cookie (`src/lib/auth.ts`) is the entire auth model. There are no admin *accounts*, no per-admin identity, no roles beyond "has the password or doesn't." `src/proxy.ts` is a cheap cookie-existence redirect for UX only — the real security boundary is `isAdmin()`, called inside every `/api/admin/*` route handler. Do not propose per-admin logins, OAuth, or Supabase Auth "since we already have some auth now" — the single shared password is a deliberate simplicity choice (soul.md: "simple enough to run... one admin password").

### Pattern: PII Minimization via Rate Limiting, Not Hashing

This project has no anonymous-voter anti-Sybil system (no IP/fingerprint hashing, no `hash.ts` — that's peta-koperasi's model). The anti-abuse mechanism here is `src/lib/rate-limit.ts`, an in-memory per-IP fixed-window limiter, applied to `POST /api/submissions` (5/hour), `GET /api/geocode` (30/min), and `POST /api/admin/login` (8/15min, brute-force guard). It is explicitly per-instance and not multi-region-safe — CLAUDE.md rule 8 says: if this ever runs multi-region, swap it, don't remove it. Do not propose storing raw IPs anywhere; `clientIp()` reads them transiently from request headers for the rate-limit key only, never persisted to the database.

---

## Common Architectural Mistakes in This Project

### Mistake 1: "Let's let contributors check the status of their own submission."

This requires identifying who submitted something — an implicit identity system. There are no user accounts (CLAUDE.md "What NOT to Do"). A `POST /api/submissions` response already returns the `id`, so a determined contributor *could* poll `GET /api/submissions/[id]` if such a route existed — but that route does not exist and would leak `workshop_submissions` contents (including other people's pending data if IDs are guessable) unless carefully scoped. Don't build this without an explicit architecture decision; the current answer is "no such route."

**Corrective question:** "Does solving this actually require identity, or can it be solved with a one-time secret token returned at submission time instead?"

### Mistake 2: "Let's cache workshop data in Redis for performance."

The scale target is nowhere near needing this — SPEC.md's own PostGIS-migration trigger is ~50k rows, and `VIEWPORT_LIMIT` already caps every query at 300 rows. Redis adds a service to run, monitor, and pay for, for a problem that hasn't been measured. Supabase's built-in connection pooling is sufficient at this scale.

**Corrective question:** "Have we actually measured a performance problem? What does `EXPLAIN ANALYZE` on the slow query show?"

### Mistake 3: "This component is getting complex, let's add a Context provider."

React Context is for data needing to be accessible deep in the tree without prop drilling. This project has no global state need beyond what a single page's component tree already handles (map viewport state lives in `WorkshopMap`, form state lives in `SubmitForm`, admin tab state lives in `AdminDashboard`). Do not introduce a global state management system.

### Mistake 4: "Let's move the approve/reject logic to a Supabase Edge Function."

The logic in `admin/submissions/[id]/route.ts` is intentional. It is co-located with the application code, readable by any contributor, and deployable to Vercel without a separate Supabase function deployment pipeline. Do not introduce Edge Functions unless a genuine latency or access problem exists that cannot be solved in the Next.js route.

### Mistake 5: "Let's add PostGIS now, it's more 'correct.'"

Correctness for its own sake isn't the bar here — CLAUDE.md rule 9 is explicit: PostGIS is deferred until scale requires it, *and* until the Android app's schema adopts it too, because both apps must keep consistent query patterns against the same table. Introducing it unilaterally in this repo would fork the two apps' data access assumptions. See `geo-data-review`.

---

## Anti-Patterns

| Anti-Pattern | Signal | Correct Approach |
|---|---|---|
| Loading all workshops on mount | Any query on `workshops` without `.limit()` | Viewport-bounded query via `getWorkshopsInBounds()`, capped at `VIEWPORT_LIMIT` |
| Public route reading `workshop_submissions` | `.from("workshop_submissions")` outside `/api/admin/*` | Only admin routes, only via `createAdminClient()` |
| Service-role client used before `isAdmin()` check | `createAdminClient()` called above the auth check in a route handler | Auth check is always the first line of the handler body |
| Status change outside the approve/reject route | `UPDATE workshop_submissions SET status = ...` anywhere but `[id]/route.ts` | Only that one PATCH handler touches `status` |
| Re-review of a terminal submission | Any code path allowing `approved`/`rejected` → something else | Terminal states are terminal; DB edits only, not through the app |
| Adding a dependency to solve a one-time problem | Installing a library for something a 5-line function would do | Write the 5-line function |
| Using Supabase Auth or NextAuth "for something small" | "Let's just add auth for..." | No — the shared `ADMIN_PASSWORD` is the whole auth model by design |
| Introducing PostGIS unilaterally | `ST_Within`/`geography` column added to `workshops` without Android-side coordination | Plain lat/lng comparisons until the ~50k-row trigger, coordinated across both repos |

---

## Integration with Other Skills

After completing an architectural decision, route work to the relevant specialist skill:

| If the change involves... | Also run... |
|---|---|
| New DB column or query pattern | `database-review` + `geo-data-review` (if geo-related) |
| New API route | `api-review` |
| New UI component | `design-system-review` |
| Map rendering changes | `geo-data-review` |
| New npm dependency | `bundle-review` |
| New feature across multiple layers | `feature-planner` first |
| Review/moderation flow changes | `crowdsourcing-review` |
| Public-interest / safety framing check | `safety-data-review` |

---

## Checklist Before Approving an Architectural Decision

```
[ ] soul.md filter: passes at least 2 of 4 questions
[ ] All 9 CLAUDE.md locked rules checked, none violated
[ ] SPEC.md §10 out-of-scope list checked
[ ] Shared-schema impact assessed: does this touch workshops/workshop_submissions,
    and if so has ../tambalban been considered?
[ ] Data flow drawn from user action → DB → response
[ ] isAdmin() gate present and first, on every new /api/admin/* route
[ ] Rate limiting present on any new public write or proxy route
[ ] No new auth system, admin accounts, or roles beyond the single shared password
[ ] Status transitions: only pending -> approved | rejected, both terminal
[ ] New dependencies: bundle cost and maintenance justified
[ ] Module boundaries: understandable by a contributor in 1 day
[ ] No PostGIS introduced without Android-side coordination
[ ] Server components used by default; "use client" justified (Leaflet, forms, browser APIs)
[ ] No new global state management
```

---

## Exit Criteria

An architectural decision is complete when:

1. The decision document is written (Decision / Why / What changes / What stays / Shared-schema impact / Risks / Alternatives rejected / Exit criteria).
2. All checklist items above are checked.
3. If the change touches `workshops` or `workshop_submissions`, the Android-app coordination need has been explicitly named, even if the answer is "no coordination needed because X."
4. The implementation scope is small enough for a single PR. If not, break it down — use `feature-planner`.
5. Any follow-on skill work has been explicitly named.

---

## Example: Evaluating "Let contributors edit their own submission before it's reviewed"

**Proposed:** After submitting, a contributor should be able to fix a typo in their pending submission.

**Step 1 — soul.md filter:**
- Makes a workshop findable faster? Marginally — fewer bad submissions reach the admin queue.
- Keeps data accurate? Arguably yes.
- Consistent with the Android app? Neutral — Android has its own submit flow, unrelated.
- Stays light and free? No — requires some way to prove "this is your submission," which is identity.

**Step 2 — Locked rules:**
- "What NOT to Do": no user accounts. Editing "your own" submission requires knowing which submission is yours — the only honest way to do this without accounts is a one-time secret (e.g., the `id` returned at submission time, treated as a bearer capability) rather than a login.

**Step 3 — Alternative:**
- The submission form already shows the returned `id` on success (`submit-form.tsx`'s "Terkirim!" state). A contributor who needs to fix something could resubmit — the admin queue would then show two pending entries, and the admin rejects the stale one and approves the corrected one. No new infrastructure.
- If editing genuinely becomes a pain point, a scoped "edit via the id-as-token" route is possible later, but it's a real architectural decision (is the id guessable? does it need its own rate limit?) — not a default.

**Decision:** Reject a full edit feature. Resubmission + admin picking the correct one is the existing workaround, and it requires zero new code. Document as a note for `SPEC.md` if this comes up again.

---

*This skill is governed by soul.md. When in doubt: does it help a stranded driver find real help faster, without compromising accuracy or the shared source of truth with the Android app?*
