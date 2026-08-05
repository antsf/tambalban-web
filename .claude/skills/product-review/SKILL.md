---
name: product-review
description: Five-lens PR review for TambalBan Web — soul alignment, spec compliance, the 9 locked architectural rules, contributor legibility, long-term maintainability.
---

# Skill: product-review

Review a completed feature or PR against TambalBan Web's soul, spec, and architectural rules before it is merged.

---

## Purpose

Code review in most projects asks: "Does this work? Is it clean?" Product review for this project asks five harder questions, in order of priority:

1. Does this belong in this project at all?
2. Does it comply with what the spec says?
3. Does it obey the rules locked for good reasons?
4. Can the next contributor understand it?
5. Will we regret merging this in six months?

---

## When to Invoke

- A PR is ready for review and touches more than a single file.
- A feature has been implemented and needs sign-off before merge.
- Before any release or deployment of new functionality.
- Verifying a change that touches shared tables (`workshops`, `workshop_submissions`) is actually compatible with what the Android app (`../tambalban`) reads/writes.

## When NOT to Invoke

- The change is a typo fix, dependency version bump, or Tailwind class adjustment.
- The change is still in progress.

---

## The Five Review Lenses

Apply in order. If a change fails an earlier lens, resolve that before spending time on later lenses.

### Lens 1: Soul Alignment

Read the diff and ask the `soul.md` decision-making questions:

1. **Does this make a workshop findable faster in an emergency?** Not for developer convenience, not for a demo. For the driver with a flat tire, at night, on weak signal, using the Android app fed by this data.
2. **Does this keep the data accurate?** Speed must never cost correctness — `soul.md`: "a fake workshop is worse than a missing one." Anything that could let bad data reach `workshops` without human review is a serious concern.
3. **Does this stay consistent with what the Android app reads?** `workshops` and `workshop_submissions` are shared with `../tambalban`. A schema or semantics change that only this repo knows about silently breaks the Android app.
4. **Does this stay light and free to run?** No paid dependencies, no infrastructure complexity without strong justification (`soul.md`: "One admin password, one Supabase project, no elaborate infrastructure").

**Failure at this lens:** the change may be technically excellent but wrong for this project. "This is well-built code. However, it introduces [specific thing], which moves us away from [specific soul.md value]. Here's what I'd change: [specific suggestion]."

### Lens 2: Spec Compliance

Compare the implementation against `SPEC.md`:

- Does the API route match the spec's request/response format (§4)?
- Does the data model match §3 (`workshops` / `workshop_submissions` columns)?
- Do submission status transitions follow §5 exactly (`pending -> approved | rejected`, both terminal)?
- Is the component/page listed in §6?
- Does the file live where §7's file structure says it should?
- Is the feature in §10's out-of-scope list (community voting, user accounts, PostGIS, photo uploads, multi-region rate limiting)?

**Common spec compliance failures in this project:**
- Adding a status other than `pending`/`approved`/`rejected`, or a transition other than the two valid ones.
- Adding a "re-review" or "un-reject" route — `SPEC.md` §5 explicitly says these don't exist by design, to keep `reviewed_at` honest.
- Adding a field to `workshops`/`workshop_submissions` without checking compatibility with `../tambalban/supabase_schema.sql`.
- Adding a new env var not documented in §8.

**Failure at this lens:** "The spec says X, this implements Y. Either the implementation changes to match the spec, or the spec needs to be amended first — including checking with the Android app's schema owner if it's a shared-table change. We don't ship spec-divergent code."

### Lens 3: Architectural Rules

Go through all 9 locked rules in `CLAUDE.md`. All nine, every time.

| Rule | What to check in the diff |
|---|---|
| 1. Submissions invisible until approved | Does `/api/workshops` (or any public route) ever read from `workshop_submissions`? Should only ever query `workshops`. |
| 2. `SUPABASE_SERVICE_ROLE_KEY` is admin-only | Is `createAdminClient()` (`src/lib/supabase/admin.ts`) used only inside `/api/admin/*` routes, each starting with an `isAdmin()` check? Any import of `admin.ts` from a client component or public route is a violation. |
| 3. Review is admin-gated, not voted | Does the diff add any upvote/downvote/threshold logic? That's explicitly `../peta-koperasi`'s model, not this one's. |
| 4. Status transitions are one-way | Only `pending -> approved` and `pending -> reject`. No "un-reject." No editing an already-terminal submission. |
| 5. Shared tables need cross-repo compatibility | Any migration touching `workshops`/`workshop_submissions` — has the Android app's schema been checked? Was a column renamed/dropped that the Kotlin app depends on? |
| 6. Indonesia bounds validation | Any code accepting lat/lng validates against `INDONESIA_BOUNDS` (`src/lib/validation.ts`, -11..6 / 95..141) at the Zod schema level, not just client-side. |
| 7. OSM only | Any tile URL is `tile.openstreetmap.org` or equivalent free provider; any geocoding goes through Nominatim via `/api/geocode`, never a proprietary geocoder called directly from the client. |
| 8. Rate limiting on public write/geocode routes | New public POST or geocode-adjacent route — does it call `src/lib/rate-limit.ts`'s `rateLimit()`? |
| 9. No PostGIS | Any new query against `workshops` uses plain lat/lng column comparisons, not `ST_Within`/`ST_MakeEnvelope` — unless the Android app's schema adopts PostGIS first (keep both apps' query patterns consistent). |

**Failure at this lens:** "This PR violates CLAUDE.md rule [N]: [quote it]. Specifically, [exact file/line]. This rule is locked. Fix: [specific fix]."

### Lens 4: Contributor Legibility

- **File naming:** kebab-case per `CLAUDE.md`. `WorkshopMap.tsx` -> reject, should be `workshop-map.tsx`.
- **Export style:** named exports, except `page.tsx`/`route.ts` which follow Next.js convention.
- **Component size:** if a component exceeds ~150 lines, consider decomposition (`submit-form.tsx` is already close to this — watch it, don't let it balloon further without splitting the location column vs detail column into subcomponents).
- **Magic numbers:** `VIEWPORT_LIMIT`, submission rate limit (5/hour), geocode rate limit (30/min), login rate limit (8/15min), session TTL (12h) should stay named constants, not scattered literals.
- **Comments:** explain *why*, not *what*. `// Guards against a double-click promoting the same submission twice.` (actual comment in `[id]/route.ts`) is good.
- **Type safety:** no `any` without a `// TODO: type properly` comment; no `as` casts that mask real mismatches.

### Lens 5: Long-Term Maintainability

- **Dependencies:** does this add a new npm package? `CLAUDE.md`: "Do NOT install heavy dependencies without justification." Check bundle-size impact per `lighthouse-review`.
- **Coupling:** does this create a new dependency between previously-independent modules?
- **Test coverage:** this project currently has **no test framework configured** (see `testing-engineer`). If this PR adds non-trivial logic to `src/lib/validation.ts` or the approve/reject state machine in `[id]/route.ts`, flag that Vitest should be set up before or alongside this change, not deferred indefinitely.
- **Migration reversibility:** if this adds a Supabase migration (`supabase/migrations/`), can it be reversed? Does it stay compatible with the Android app's existing schema?

**Failure at this lens:** "This will work today but create problems in [specific scenario]. Consider: [specific mitigation]."

---

## Project-Specific Review Checks

### Submission visibility

```
Does the code query workshop_submissions from a route reachable without isAdmin()?
  YES -> BLOCK. Violates CLAUDE.md rule 1 / SPEC.md §9.
  NO  -> Pass
```

### Service-role key exposure

```
Does the diff import src/lib/supabase/admin.ts or reference SUPABASE_SERVICE_ROLE_KEY?
  YES -> Is this inside src/app/api/admin/*, after an isAdmin() check as the first statement?
    YES -> Pass
    NO  -> BLOCK. Violates CLAUDE.md rule 2.
  NO  -> Pass
```

### Status transitions

```
Does the code UPDATE workshop_submissions.status?
  YES -> Is this only in src/app/api/admin/submissions/[id]/route.ts?
    NO  -> BLOCK. Status changes outside the review route violate the architecture.
    YES -> Is the new status one of "approved"/"rejected", from a submission currently "pending"?
      YES -> Pass
      NO  -> BLOCK. Invalid transition or missing the 409 guard on non-pending submissions.
```

### Shared-table schema changes

```
Does the diff add/modify/drop a column on workshops or workshop_submissions?
  YES -> Has ../tambalban/supabase_schema.sql and ../tambalban/CLAUDE.md been checked for compatibility?
    YES -> Pass (document the cross-repo coordination in the PR description)
    NO  -> BLOCK. Coordinate with the Android app before merging.
```

### Indonesia bounds

```
Does the code accept latitude/longitude from a request body or query param?
  YES -> Is it validated against INDONESIA_BOUNDS via the Zod schema (src/lib/validation.ts)?
    YES -> Pass
    NO  -> BLOCK. Violates CLAUDE.md rule 6.
```

### Rate limiting

```
Does this add a new public POST route or a route calling an external service (Nominatim)?
  YES -> Does it call rateLimit() from src/lib/rate-limit.ts before doing the work?
    YES -> Pass
    NO  -> BLOCK or SUGGEST depending on abuse potential — flag explicitly either way.
```

---

## How to Give Feedback

1. **Start with what's good**, specifically.
2. **Separate must-fix from nice-to-have:** BLOCK / SUGGEST / QUESTION / NIT.
3. **Explain why, not just what.**
4. **Offer solutions, not just problems.**
5. **Don't pile on** — prioritize the most important issues.
6. **Never use the review as a teaching moment about things unrelated to the PR.**

### Tone examples

Bad: "This is wrong, admin routes need isAdmin()."

Good: "BLOCK: This new `/api/admin/*` route doesn't call `isAdmin()` before using `createAdminClient()`. This violates CLAUDE.md rule 2 — the service-role key bypasses RLS, so this route is currently reachable by anyone who knows the URL. Fix: add `if (!(await isAdmin())) return Response.json({ error: 'Tidak diizinkan' }, { status: 401 });` as the first line, matching the pattern in the existing admin routes."

---

## When to Approve vs Request Changes vs Reject

### Approve with comments
Zero BLOCKs, all five lenses pass. SUGGEST/NIT comments can remain open.

### Request changes
One or more specific, fixable BLOCKs; direction is correct. "This is heading the right way. [N] items need to change before merge, each with a fix included."

### Reject
Fails Lens 1 or Lens 2 in a way that can't be fixed incrementally — e.g. a PR that adds community voting, or one that adds a `workshops` column the Android app can't handle without its own release. "Thank you for this work. I have to flag a fundamental issue: [specific problem, grounded in soul.md/SPEC.md]. Here's what I'd suggest instead: [alternative]."

**Never reject without an alternative.**

---

## Review Checklist

### Soul & Scope (Lens 1-2)
```
[ ] soul.md: change helps a workshop get found faster in an emergency (or enables something that will)
[ ] soul.md: change keeps data accurate — no path for unreviewed data to become public
[ ] soul.md: change stays consistent with what the Android app reads (shared tables checked)
[ ] soul.md: change stays light/free — no new paid dependency or unjustified complexity
[ ] SPEC.md §10: feature is not on the out-of-scope list
[ ] SPEC.md §3-4: implementation matches the data model and API contracts
```

### Locked Rules (Lens 3)
```
[ ] Rule 1 — submissions invisible: no public route reads workshop_submissions
[ ] Rule 2 — service-role key admin-only: only admin.ts, only in /api/admin/*, only after isAdmin()
[ ] Rule 3 — no voting system introduced
[ ] Rule 4 — status transitions one-way: pending -> approved | rejected only, guarded by a 409 on non-pending
[ ] Rule 5 — shared-table changes checked against ../tambalban's schema
[ ] Rule 6 — Indonesia bounds enforced in Zod schema, not just client-side
[ ] Rule 7 — OSM tiles only; geocoding only via Nominatim through /api/geocode
[ ] Rule 8 — new public write/geocode routes call rateLimit()
[ ] Rule 9 — no PostGIS introduced unilaterally
```

### Code Quality (Lens 4-5)
```
[ ] TypeScript strict: no untyped any without a TODO
[ ] File naming: kebab-case
[ ] Named exports (except page.tsx/route.ts)
[ ] Server components by default; "use client" only where genuinely needed
[ ] Tailwind only, no CSS modules/inline styles
[ ] Zod validation before any DB work in every API route
[ ] Supabase queries go through src/lib/geo.ts or the two client modules — not inline
[ ] No invented i18n system, no invented photo-upload handling
[ ] No unnecessary new npm dependency
[ ] If non-trivial logic added to validation.ts or the review state machine: Vitest setup flagged if still absent
```

---

## Common Mistakes Reviewers Make

1. **Being too strict on style while missing a rule violation.** A perfectly styled component that lets `workshop_submissions` leak publicly is worse than an ugly component that doesn't.
2. **Not checking cross-repo compatibility.** A schema change reviewed only against this repo's TypeScript types, without checking `../tambalban`, can silently break the Android app on next sync.
3. **Reviewing only the happy path.** For every API route change: valid input, invalid input, edge case (already-reviewed submission, out-of-bounds coordinates, rate limit exceeded).
4. **Applying rules from other projects.** This is not `../peta-koperasi` — it has admin auth, no PostGIS, no voting, no i18n. Don't import that project's review checklist wholesale.
5. **Approving to be nice.** Approving broken code is not kind — it's negligent, and on this project a leaked pending submission or a broken approve flow has real-world consequences for someone relying on the data later.

---

## Exit Criteria: What "Approved" Means

A PR is approved for merge when ALL of the following are true:

1. All five lenses pass.
2. Zero BLOCK comments remain unresolved.
3. No locked CLAUDE.md rule is violated (all 9 checked).
4. No out-of-scope feature (`SPEC.md` §10) was introduced.
5. Shared-table schema changes have been checked against `../tambalban`.
6. Tests exist for new non-trivial logic, or a Vitest setup gap has been explicitly flagged rather than silently skipped.
7. The reviewer can explain what this PR does in one sentence. If not, it's doing too much and should be split.

---

*This site is the second front door onto data someone will trust in an emergency. Review it like that's true — because it is.*
