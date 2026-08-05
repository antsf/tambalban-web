---
name: roadmap-planner
description: Plan TambalBan Web's Now/Next/Later/Never roadmap against soul.md's two-front-doors principle and the Android app's shared schema — evaluates feature requests like community voting.
---

# Skill: roadmap-planner

Plan the sequenced evolution of TambalBan Web from its current v1 (public map + submission queue + admin review) toward long-term usefulness — without scope creep, feature bloat, or drifting from `soul.md`.

---

## Purpose

TambalBan Web exists for exactly two things (per `SPEC.md` §1): showing the public map, and collecting new submissions for a human to review. It does not duplicate the Android app's authenticated features (reviews, ratings, profiles). Roadmap planning here means deciding what grows next without turning this into a second Android app, without adding complexity the sibling app or a solo maintainer can't keep in sync, and without softening the accuracy-over-speed review model that's the whole point of this site (`soul.md`: "Unlike community maps that lean on mass voting, every submission here is checked one by one before going public").

---

## When to Invoke

- After a milestone, to decide what comes next.
- When a contributor proposes a significant new feature and you need to decide whether it belongs now, later, or never.
- When the issue tracker accumulates feature requests and needs prioritizing.
- When someone says "we should add X because [other map project] has it" — especially `../peta-koperasi`, which shares a lot of surface-level architecture but a fundamentally different review model.
- At any point the project feels like it's drifting from its two-things-only scope.

## When NOT to Invoke

- For implementation planning of an already-decided feature.
- For reviewing completed work (use `product-review`).
- For a single bug fix.

---

## The Two-Front-Doors Principle

`soul.md`'s core framing: this site is a **second front door** onto data the Android app already collects and serves. Every roadmap item should be evaluated against what that means:

1. **Is this something the Android app should own instead?** Reviews, ratings, user profiles, in-app browsing UX for drivers — that's the Android app's job (`SPEC.md` §1: "It does not duplicate the Android app's authenticated user features"). If a proposal starts to look like "let's add [Android app feature] to the website too," that's a strong signal it doesn't belong here.
2. **Does this keep both doors writing to the same source of truth cleanly?** Any change to `workshops`/`workshop_submissions` needs to stay something the Kotlin app can still read/write without a coordinated release. A roadmap item that would require the Android app to change in lockstep is a much bigger bet than one that doesn't.
3. **Does this serve accuracy over speed?** A proposal that makes it faster to get data live at the cost of review rigor cuts against the entire reason this project reviews one-by-one instead of voting.
4. **Does this stay something one admin, one password, one Supabase project can run?** `soul.md`: "Whoever picks this project up later should be running it within minutes."

---

## Evaluating "the community asked for it" vs "it serves the mission"

A contributor opens an issue: "Add community voting so approvals happen faster, like other crowdsourced maps do." Several people react with thumbs-up.

Run it through `soul.md`:
- Does this make a workshop findable faster in an emergency? Maybe marginally faster to *approve*, but the actual finding happens later, in the Android app, and depends on *accuracy*, not approval latency.
- Does it keep data accurate? No — it's a direct trade against `soul.md`'s explicit design choice: "every submission here is checked one by one before going public... because the person opening this map is usually in the middle of an emergency." Voting-based approval is precisely the model this project deliberately rejected.
- Does it stay consistent with the Android app? Neutral.
- Does it stay simple to run? No — it adds a whole dedup/anti-Sybil subsystem (hashing, fingerprinting, rate limiting per voter) that doesn't currently exist and that the current one-admin-password model doesn't need.

Result: this is a `CLAUDE.md`-locked-rule violation (rule 3: "Review is admin-gated, not community-voted... Do not add a voting system"), not a Now/Next/Later candidate at all. It's Never, and the popularity of the request doesn't change that.

**How to communicate this:** "We hear you — review does take a human, so it's not instant. That's deliberate: this data feeds an emergency tool, and a wrong pin is worse than a missing one (see soul.md). If the review queue is genuinely backing up, the fix is more reviewer capacity or a faster review UI, not a voting shortcut. We're not going to add community voting to this project."

---

## The Horizon Model: Now / Next / Later

### Now (current cycle, 1-3 months)

Items addressing: a broken/incomplete part of the v1 spec, a friction point blocking real submissions, a data-quality problem, or infrastructure currently blocking a visible improvement.

**Constraint:** max 3 items.

**Plausible Now-horizon examples for this project:**
- Fix a submit-form UX issue if real submitters are dropping off partway through.
- Speed up the admin review UI if the queue is genuinely backing up (e.g. bulk-approve for obviously-good submissions, better keyboard shortcuts) — *without* weakening the human-review requirement.
- Add basic Vitest coverage for `src/lib/validation.ts` and the approve/reject state machine (`[id]/route.ts`) — currently untested (see `testing-engineer`), and this is exactly the kind of infrastructure work that's justified because it protects a locked architectural rule.

### Next (3-6 months)

Items that depend on Now items landing, are validated by evidence from Now-phase usage, and have a clear implementation path.

**Plausible Next-horizon examples:**
- Exposing the existing `/api/workshops?q=` name search in the actual UI (the endpoint already supports it per `SPEC.md` §4.1; check whether `page.tsx` currently surfaces a search input — if not, that's a low-risk, spec-compliant addition, not a new capability).
- A lightweight way for a submitter to check their own submission's status (currently there's no lookup at all after leaving the confirmation screen) — needs careful design to avoid requiring accounts (locked rule: no Supabase Auth, no NextAuth).

### Later (6+ months, only if the project is healthy)

Items requiring significant infrastructure, speculative demand, or relevance only at real scale.

**Plausible Later-horizon examples:**
- Photo uploads on submissions (`SPEC.md` §10 explicitly notes the Android app's `AddWorkshopActivity` may add this; not mirrored here yet — would need storage, moderation-before-display logic, and bandwidth cost considerations).
- Migrating `workshops` queries to PostGIS if the table passes ~50k rows (`SPEC.md` §10, `geo.ts` docstring already flags this threshold) — and only if the Android app's schema adopts it too, per `CLAUDE.md` rule 9.
- Multi-region rate limiting (swap the in-memory limiter for something like Upstash) if the deployment ever goes multi-region (`SPEC.md` §10, `rate-limit.ts` docstring already flags this).

### Never (for this project)

Items that violate `soul.md`, `CLAUDE.md`'s locked rules, or `SPEC.md` §10. These don't graduate to Later.

**Permanent residents of Never:**
- Community voting / approval thresholds (CLAUDE.md rule 3 — this is `../peta-koperasi`'s model, explicitly not this one's).
- Supabase Auth, NextAuth, or per-user accounts for contributors (CLAUDE.md rule 1... i.e. the "No Supabase Auth" rule; admin access stays a single shared password by design).
- "Un-reject" / re-review routes (CLAUDE.md rule 4 — status transitions are one-way to keep the audit trail honest; re-review happens by editing the DB directly).
- Paid map tiles or paid geocoding (CLAUDE.md rule 7).
- Bypassing `isAdmin()` on any admin route, even temporarily, for any reason (CLAUDE.md).

---

## Evaluating a Proposed Roadmap Item

### Step 1 — Never-list check
Is this on the Never list, or does it violate a `CLAUDE.md` locked rule or `SPEC.md` §10 item? If yes, respond with the specific rule/reason. Don't hedge with "maybe someday" if the answer is genuinely never.

### Step 2 — Soul filter
Run the four `soul.md` decision questions. An item should pass at least 2 of 4 to proceed.

### Step 3 — Evidence check

| Evidence Type | Strength |
|---|---|
| A shop owner or contributor reported this friction directly | Strong |
| Multiple independent issues report the same problem | Strong |
| The admin (reviewer) reports the queue/tooling is a real bottleneck | Strong |
| A developer thinks it would be cool | Weak |
| Another map project (including `../peta-koperasi`) does it | Irrelevant unless the context genuinely matches — and often it doesn't, because that project's whole review model is different |
| It's technically elegant | Irrelevant |

### Step 4 — Dependency check

- Needs a new/changed column on `workshops`/`workshop_submissions` -> must be checked against `../tambalban/supabase_schema.sql` and coordinated with the Android app's owner before it can enter Now.
- Needs a new npm dependency -> justify the cost (see `react-performance`/`lighthouse-review` for bundle-size framing).
- Needs infrastructure (Redis, queue, cron, multi-region) -> almost certainly Later, not Now, for a project this size.

### Step 5 — Horizon assignment

```
Failed Never-list check -> Never
Passed soul filter + strong evidence + no cross-repo dependency -> Now (if space)
Passed soul filter + strong evidence + has dependencies -> Next
Passed soul filter + weak evidence -> Later
Failed soul filter but has strong evidence -> Later (re-evaluate if evidence grows)
```

---

## Sequencing Infrastructure vs Visible Features

Infrastructure work (test setup, refactoring, CI) is invisible to end users but sometimes necessary to protect a locked rule.

### The rule: infrastructure follows real risk, not aesthetics

**Do NOT:**
- Refactor code because it "feels messy" with no reported problem.
- Add CI before there are contributors/PRs that need it.
- Migrate to PostGIS before `workshops` is anywhere near the ~50k row threshold.

**DO:**
- Set up Vitest specifically because `validation.ts` and the approve/reject state machine are exactly the kind of logic where an untested regression would silently corrupt shared data the Android app also depends on (see `testing-engineer`).
- Fix a rate-limit edge case if abuse actually shows up.
- Coordinate a schema migration with `../tambalban` when a Now/Next item genuinely needs one.

### The 70/30 rule

At most 30% of items in a given Now cycle should be infrastructure; at least 70% should produce a user-visible (or reviewer-visible, for admin-facing work) change.

**Exception:** immediately after a stability-affecting incident (e.g. an untested approve/reject bug reaching production), one infrastructure-heavy cycle is acceptable. Just one.

---

## How to Say No to Good Ideas

1. **Acknowledge the idea's merit.**
2. **Explain the cost** — technical work plus, where relevant, the cross-repo coordination cost with `../tambalban`.
3. **Name what it displaces.**
4. **Offer the horizon**, or say clearly if it's Never and why.
5. **Thank the contributor.**

**Never** say "great idea, we'll add it to the backlog" when the real answer is Never — that wastes their anticipation. Be direct: "This isn't something we're going to build, and here's the specific reason" is more respectful than an indefinite maybe.

---

## When a Roadmap Item Needs Explicit Cross-Repo or Architecture Review

Before an item enters Now:

1. **Anything touching a locked rule** — confirm compliance before implementation begins, even if the proposal claims to comply.
2. **Any change to `workshops`/`workshop_submissions` schema** — check against `../tambalban/supabase_schema.sql` and `../tambalban/CLAUDE.md`.
3. **Any new API route or new npm dependency.**
4. **Any change to the review/status-transition logic** — this is the project's core trust mechanism; changing it is equivalent to changing the project's constitution.
5. **Any change to how the admin session/auth works** (`src/lib/auth.ts`, `src/proxy.ts`) — this is the only auth surface in the project; changes here are inherently higher-risk.

Items that do NOT need this level of scrutiny: Tailwind styling changes, bug fixes within existing modules, documentation improvements, adding tests for existing untested code.

---

## Anti-Patterns in Roadmap Planning

### Anti-Pattern 1: Importing `../peta-koperasi`'s roadmap wholesale
**Signal:** "Let's add [feature] because the sibling civic-map project has it."
**Problem:** That project has a fundamentally different review model (community voting, full anonymity, PostGIS, i18n) and a different domain (village cooperatives vs. emergency tire repair). Surface similarity (Next.js + Supabase + Leaflet) does not mean shared roadmap logic.
**Response:** Evaluate on this project's own soul.md and locked rules, not by analogy.

### Anti-Pattern 2: Treating this site as if it should replace the Android app
**Signal:** "Let's add ratings/reviews/browsing UX here too."
**Problem:** `SPEC.md` §1 is explicit: this site does not duplicate the Android app's authenticated features. It exists for exactly two things.
**Response:** "That's the Android app's job. This site's job is collecting new data and showing the public map."

### Anti-Pattern 3: Roadmap as a promise
**Signal:** A README lists "coming soon" features that haven't actually been evaluated.
**Response:** Public roadmaps should show only Now items.

### Anti-Pattern 4: Refusing to cut scope
**Signal:** A hard sub-feature (e.g. photo moderation) is stalling an otherwise-shippable item.
**Response:** Ship what works; move the hard part to Next/Later with a note on what made it hard.

---

## Roadmap Review Cadence

- **Monthly:** review the Now horizon — progressing? anything to cut, defer, or graduate from Next?
- **Quarterly:** review all three horizons; has evidence changed priorities?
- **After a milestone** (e.g. first real submission volume, first coordinated schema change with the Android app, first incident): re-evaluate the whole horizon model.

---

## Checklist Before Approving a Roadmap Decision

```
[ ] Never-list checked: item is not on it
[ ] soul.md filter: passes at least 2 of 4 questions
[ ] Evidence exists beyond "a developer thinks it would be cool"
[ ] Cross-repo dependency identified if the item touches shared tables
[ ] Horizon assigned with written justification
[ ] If Now: displaces nothing currently in progress, or displacement is justified
[ ] If Next: clear condition for when it graduates to Now
[ ] If Later: clear reason it isn't Never
[ ] No anti-patterns present (importing the sibling project's roadmap, duplicating Android app features, promises, refusing to cut scope)
```

---

## Exit Criteria

A roadmap planning session is complete when:

1. Every proposed item has a horizon assignment with written justification.
2. The Now horizon has at most 3 items.
3. The Never list has been reviewed and reconfirmed.
4. Items requiring cross-repo (`../tambalban`) coordination are explicitly flagged.
5. The 70/30 infrastructure-to-visible-work ratio is maintained in Now.
6. At least one Now item improves either data accuracy or review throughput — the two things this project exists to do well.

---

*Every roadmap item should be traceable to a driver standing on the roadside at night who will be better served because of it — directly, or through the admin who reviews the data that reaches them. If you can't draw that line, the item probably doesn't belong.*
