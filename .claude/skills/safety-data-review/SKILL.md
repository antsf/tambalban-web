---
name: safety-data-review
description: Review a feature/decision for TambalBan Web against four safety-critical data tests — accuracy under pressure, emergency findability, one source of truth, small-team sustainability.
---

# safety-data-review

Review a feature, decision, or change through the lens of safety-critical data stewardship for TambalBan Web. (Renamed from `civic-tech-review` when this skill was ported from a sibling project — the underlying concern, "is this project actually serving the people who depend on it," carries over, but the framing is different: this is not civic infrastructure for community self-governance, it is a roadside-emergency data pipeline.)

## When to use

Run this skill when reviewing any new feature proposal, architectural decision, dependency addition, or policy change. Also run when someone proposes something that "sounds reasonable technically" but may compromise the accuracy or reliability of data a stranded driver is about to trust — analytics, growth features, complexity increases, or anything that could make a bad workshop entry more likely to reach the public map.

## Activation

Trigger: user says "safety review", "safety data review", "is this safe for the map", "does this serve drivers", or invokes `/safety-data-review`.

## Instructions

You are reviewing a feature or decision through the lens of one question, straight from `soul.md`: **does this help a stranded driver find real help faster, without compromising accuracy?** Read `soul.md`'s "Decision-Making Spirit" section before every review — it is the actual source of the standard applied here, not an invented framework.

This is not a general web app. Someone opening this site, or the sibling Android app reading its data, is very likely in the middle of an actual roadside problem — at night, on a toll road, with a weak signal (soul.md's opening line). The standard for "is this feature okay" is different from ordinary product software: **a fake or wrong workshop entry is actively worse than no entry at all**, because it sends someone further astray while their situation is getting worse.

Work through each section below. For each test, explain how the feature under review passes or fails, and provide concrete reasoning grounded in `soul.md` and `CLAUDE.md`, not generic best practice.

---

### 1. What Makes This a Safety-Critical Data Project

Before reviewing, internalize these distinctions:

- **Its purpose is emergency utility, not engagement.** Success is measured by whether a driver found a real, open, correctly-located workshop — not by time-on-site, submissions-per-day, or any growth metric.
- **The data has real-world physical consequences.** A fake or stale workshop entry can send a panicking driver further from help, at night, possibly somewhere with weak signal. This is qualitatively different from, say, a wrong restaurant listing.
- **Accuracy must never lose to speed.** `soul.md`'s value #1 is literally named "Akurat Dulu, Baru Cepat" (Accuracy Before Speed) — this is why the project chose admin review over community voting or auto-publish. Any feature that trades review rigor for faster publishing needs to justify that tradeoff explicitly against this stated value.
- **It is one of two front doors to one dataset.** Web and the Android app share a Supabase project. A change here can degrade what the Android app's users see, even though they never touch this site.

---

### 2. The Four Safety-Data Tests

Apply ALL four tests to the feature or decision under review. A feature must pass all four to be acceptable.

#### Test 1: Accuracy Under Pressure

**Question:** Does this feature make it more or less likely that a wrong or fake workshop reaches the public `workshops` table?

Review criteria:
- Does the feature add any path — however narrow — for data to reach `workshops` without going through the `pending → approve` admin review step (SPEC.md §5)? There is exactly one legitimate path: `PATCH /api/admin/submissions/[id]` with `action: "approve"`. Any new insert path into `workshops` bypassing this is a direct violation of CLAUDE.md rule 1.
- Does it weaken the Indonesia-bounds validation (`INDONESIA_BOUNDS` in `src/lib/validation.ts`, CLAUDE.md rule 6) in any code path?
- Does it add pressure to approve faster with less scrutiny (e.g., a "bulk approve" button with no per-row review, an auto-approve-after-N-days timer)? Speed pressure on the one human checkpoint this project has is the single highest-risk category of change here.
- Does it make it *harder* for the admin to catch a bad submission (e.g., hiding the submitted coordinates, phone, or notes from the review UI to "simplify" it)?

**Flag if:**
- Any new path writes to `workshops` outside the existing approve action — **CRITICAL**
- Indonesia-bounds validation is weakened or bypassable — **CRITICAL**
- A feature reduces the information available to the admin at review time — **WARNING**
- A feature adds time-based or volume-based auto-approval — **CRITICAL** (directly contradicts soul.md's "Accuracy Before Speed")

#### Test 2: Findability in an Emergency

**Question:** Does this make a real, open workshop easier or harder for a stranded driver to find, right now?

Review criteria:
- Does the feature assume good signal, a modern phone, or a calm, unhurried user? (Someone with a flat tire at night is none of these.)
- Does it add steps between "open the site" and "see nearby workshops" (`/`) or "submit a workshop I just found" (`/submit`)?
- Does it degrade gracefully on a slow or intermittent connection — see `bundle-review` for the technical side of this, but the *product* question here is whether the feature is even useful if it half-loads?
- Does it make `/admin`'s review queue slower or more error-prone for the person whose job is turning submissions into findable data?

**Flag if:**
- Feature adds friction to the core "find a workshop" or "submit a workshop" flow without a safety-justified reason — **WARNING**
- Feature assumes stable connectivity with no fallback — **WARNING**
- Feature that only benefits the admin's convenience meaningfully slows down driver-facing findability — **WARNING**

#### Test 3: One Source of Truth

**Question:** Does this keep `workshops`/`workshop_submissions` consistent with what the Android app reads and writes?

Review criteria:
- Does the feature add a column, table, or write pattern that the Android app (`../tambalban`) doesn't know about or can't tolerate?
- Does it fork query patterns (e.g., introducing PostGIS here while Android still does plain lat/lng comparisons — see `geo-data-review`) in a way that could make the two apps disagree about what's "nearby"?
- Does it change what `source` values mean, or introduce ambiguity about which app created a given `workshops` row?

**Flag if:**
- A schema change isn't coordinated with `../tambalban`'s own schema/CLAUDE.md — **CRITICAL**
- Query pattern diverges between the two apps in a way that could produce inconsistent "nearby workshop" results — **WARNING**

#### Test 4: Sustainability for a Small Team

**Question:** Can this be maintained by whoever is running this project, per `soul.md`'s "Simple Enough to Run" value — one admin password, one Supabase project, no elaborate infrastructure?

Review criteria:
- Does the feature add operational complexity (new services to monitor, new APIs to maintain, new databases to back up)?
- Does it require ongoing costs (paid APIs, SaaS subscriptions) — `soul.md` is explicit: "no paid map tiles, no paid storage beyond what's necessary"?
- Does it require specialized knowledge to maintain (ML models, complex spatial algorithms) that a small team inheriting this project couldn't run "within minutes," per soul.md?

**Flag if:**
- Feature requires a paid service with no free tier — **CRITICAL**
- Feature requires specialized ML/geo knowledge to maintain — **WARNING**
- Feature adds a new external service dependency — **WARNING**

---

### 3. The "Technically Reasonable, Wrong for This Project" List

Some features are good engineering practice in general but wrong here specifically. Review against these examples:

1. **Analytics/growth tracking:** Understanding user behavior is normal for most products. Here, it adds nothing to the mission (helping a driver find a workshop) and adds a privacy cost for people in a vulnerable moment. No Google Analytics, no Mixpanel, no custom event tracking. (CLAUDE.md doesn't explicitly list this as a locked rule, but it fails all four tests above — flag as **WARNING** and require explicit justification.)

2. **Auto-approval / bulk-approval without per-row review:** Sounds efficient. Here it directly undermines the one design decision that distinguishes this project from a "just trust the crowd" map — see soul.md's Accuracy Before Speed value. **CRITICAL** if proposed without an explicit, documented tradeoff decision.

3. **Community voting or ratings on submissions (before admin review):** This is a different project's model (see `crowdsourcing-review`, which documents why this project deliberately does *not* use voting). Introducing it here, even as a supplementary "signal" for the admin, blurs the accountability line — right now, exactly one human decision (`approve`/`reject`) is the entire audit trail. **WARNING**, needs an explicit architecture decision (`architect`).

4. **Making admin login "friendlier" by weakening it** (e.g., a "remember me forever" option, removing the login rate limit, storing the password in localStorage for convenience): the admin session is the only gate between arbitrary internet traffic and the public `workshops` table. Any convenience feature that weakens this is a direct threat to accuracy. **CRITICAL.**

5. **Data monetization or "premium" placement** (e.g., a workshop paying to rank higher in results): would betray the project's stated mission — soul.md frames this project's entire reason for existing around genuinely helping a stranded driver, not around revenue. **CRITICAL** if proposed.

6. **AI-generated or auto-inferred workshop data** (e.g., scraping/inferring workshop existence from some other source and inserting directly into `workshops`, or auto-writing a submission's `notes`/`address` from a model without disclosure): un-reviewable, unverifiable data reaching a safety-critical dataset is exactly the failure mode "Accuracy Before Speed" exists to prevent. **CRITICAL** unless it flows through the same admin-reviewed `pending` queue as any other submission, and is clearly distinguishable as such to the reviewing admin.

---

### 4. The Open Data Question (Scoped Down for This Project)

Unlike a project whose data belongs conceptually to a community that generated it, `workshops`/`workshop_submissions` here belong to a specific, shared purpose: powering both this site and the Android app. Review whether the feature affects that:

1. **Does the feature lock data behind something new?** (a paywall, a required account, an API key for basic read access) — `GET /api/workshops` is currently public and unauthenticated; keep it that way unless there's a documented abuse reason.
2. **Does the feature store data in a format only this app can use?** Geographic data should stay as plain `latitude`/`longitude` (or, if the PostGIS migration described in `geo-data-review` eventually happens, standard `geography`/WKT) — not a proprietary encoding.
3. **Could the Android app, or a future integrator, use this data without depending on this specific website being up?** Data should have value independent of this app's uptime.

---

### 5. Anti-Patterns

Flag if any of these patterns are present:

1. **Complexity ratchet:** each feature adds a little operational or maintenance burden. Over time, "one admin password, one Supabase project" (soul.md) stops being true. Every feature must justify its maintenance burden against this stated simplicity goal.
2. **Speed-over-accuracy creep:** any change that makes it easier to publish data faster at the cost of scrutiny — see Test 1. This is the single most important anti-pattern to watch for in this specific project.
3. **Schema drift from the Android app:** changes that make this repo's understanding of `workshops`/`workshop_submissions` diverge from `../tambalban`'s, even subtly.
4. **Engagement farming:** optimizing for return visits, session length, or notification clicks rather than "did this person find a real workshop and get back on the road."
5. **Paternalism toward admins:** hiding information from the review UI "to simplify it" removes exactly the context a human reviewer needs to catch a bad submission.

---

### 6. Review Checklist

- [ ] Accuracy test: no new path to `workshops` bypasses admin approval; Indonesia bounds validation intact; no speed-over-scrutiny pressure added
- [ ] Findability test: doesn't add friction to `/` or `/submit`; degrades gracefully on weak connections
- [ ] One-source-of-truth test: no schema/query divergence from `../tambalban` without coordination
- [ ] Sustainability test: no new paid service, no specialized-knowledge maintenance burden, still runnable by a small team
- [ ] Not a disguised anti-pattern (analytics, auto-approval, voting-before-review, weakened admin auth, monetization, un-reviewed AI-generated data)
- [ ] No complexity ratchet without justification
- [ ] Consistent with `soul.md`'s Decision-Making Spirit questions
- [ ] Consistent with `CLAUDE.md`'s 9 locked architectural rules

---

### 7. Exit Criteria

The review is complete when:

1. All four safety-data tests have been applied with clear PASS/FAIL and reasoning grounded in `soul.md` and `CLAUDE.md`, not generic best practice.
2. The "technically reasonable, wrong for this project" list has been checked against the proposal.
3. Any CRITICAL findings include a recommendation to reject or substantially redesign the feature.
4. Any WARNING findings include specific modifications that would make the feature acceptable.
5. A final verdict is provided: APPROVE, APPROVE WITH MODIFICATIONS, or REJECT.
6. The verdict includes a one-paragraph impact statement explaining, in soul.md's own terms, how this feature helps or harms a driver finding real help faster without compromising accuracy.

---

*Ban bocor tidak bisa menunggu birokrasi. A flat tire cannot wait on bureaucracy — but the data that tells someone where to go for help has to be right, or the seconds saved are worse than wasted.*
