---
name: issue-triager
description: Triage GitHub issues for TambalBan Web — categorize, label, respond within 3 days, and distinguish web-app issues from Android-app issues sharing the same data.
---

# Skill: issue-triager

Triaging and managing GitHub issues for TambalBan Web — the data-collection website that feeds the same Supabase project as the TambalBan Android app (`../tambalban`).

---

## Purpose

Ensure every issue filed on this repository gets a timely, accurate response. Triage means: read, categorize, label, respond, and close (if appropriate). No issue should go unanswered for more than 3 days.

This project exists so a driver with a flat tire can find a real, open tire-repair shop fast (see `soul.md`). Bugs and bad data here are not cosmetic — they can send someone stranded on the roadside further astray. Triage with that urgency, but also with patience: contributors range from shop owners filling out a form for the first time to developers filing detailed bug reports. Some reports will be in Bahasa Indonesia.

---

## When to Invoke

- A new issue is filed and needs categorization and response.
- A batch of issues needs triage (backlog cleanup).
- An issue is stale and needs follow-up or closure.
- A duplicate issue is filed and needs linking to the original.
- An out-of-scope feature request needs a kind decline.
- A data quality report (wrong/fake workshop) needs a response.

## When NOT to Invoke

- Reviewing a PR (use `product-review` or the relevant tech-specific review skill).
- Making architectural decisions about a feature described in an issue.
- An issue is actually about the Android app (`../tambalban`), not this website — redirect it there (see "Which Repo" below) rather than triaging it here.

---

## Which Repo Does This Belong To?

TambalBan Web and the TambalBan Android app are separate codebases sharing one Supabase project (`workshops`, `workshop_submissions`). A reporter often does not know which "app" they used. Before triaging, check:

| Signal | Repo |
|---|---|
| "I used the website to add a workshop" / mentions a browser, `/submit` | This repo (tambalban-web) |
| "The app crashed" / mentions the Android app, ratings, reviews, phone install | `../tambalban` (Android) |
| "A workshop is missing/wrong on the map" | Ambiguous — the data is shared. Check whether it came from `source: "web"` if you have DB access; otherwise ask |
| Unclear | Ask: "Did you use the TambalBan Android app or the website (tambalban.example.com)?" |

If it is clearly an Android-app issue, redirect politely and link to `../tambalban`'s issue tracker if one exists. Do not triage it as a web issue.

---

## Issue Types

### 1. Bug Report

**Signal**: Something is broken. The user describes unexpected behavior.

**Common examples in this project**:
- "Peta tidak muncul" / "Map doesn't appear" — tile loading failure, JavaScript error, or `/api/workshops` failure.
- "Sudah kirim tapi tidak muncul di peta" / "I submitted but it's not on the map" — could be correct behavior (submission is `pending`, awaiting admin approval — there is no auto-publish) or an actual bug in the approve flow.
- "Nomor telepon tidak bisa ditelepon" / "Phone number doesn't call" — `tel:` link formatting issue in `formatHours`/`telHref` (`src/lib/format.ts`).
- "Alamat tidak terisi otomatis" / "Address didn't auto-fill" — reverse geocoding is best-effort (`/api/geocode`); Nominatim can fail or rate-limit. Not necessarily a bug.

**Triage actions**:
1. Label: `bug` + domain label (`map`, `api`, `admin`, `submit-form`).
2. Assess severity:
   - **Critical**: a real, open workshop is unreachable/undiscoverable because of this bug (map totally broken, submissions silently failing, admin approve broken so nothing ever reaches `workshops`). This directly blocks the soul.md mission — treat as urgent.
   - **Major**: feature not working for many users (submit form fails validation incorrectly, geocode proxy down).
   - **Minor**: cosmetic issue, single browser, edge case.
3. If information is missing, request it (see Bug Report Quality below).
4. If it is actually correct behavior (submission pending admin review, not yet approved), explain the review flow and close.

### 2. Data Quality Report

**Signal**: A user found a wrong, fake, closed, or duplicate workshop on the map.

**Common examples**:
- "Tambal ban ini sudah tutup" / "This shop is closed."
- "Lokasinya salah" / "The location is wrong."
- "Ini duplikat" / "This is a duplicate."

**Important — this is different from a voting-based crowd map**: there is no downvote/flag mechanism for the public, and this repo has no admin UI for editing or removing an existing `workshops` row (only `workshop_submissions` go through approve/reject). A data quality report on a *live* workshop cannot be self-service resolved through the app.

**Triage actions**:
1. Label: `data-quality`.
2. Treat with urgency — per `soul.md`, "a fake workshop is worse than a missing one" and stale/wrong data actively hurts someone with a flat tire.
3. Respond explaining: the report has been received, and correcting a *live* `workshops` row requires a maintainer to edit the shared Supabase table directly (there is no in-app edit/delete route by design — see `SPEC.md` §5). Coordinate with whoever maintains `../tambalban` too, since it's the same table.
4. If it is about a `pending` submission that hasn't been approved yet, that's easier: it can simply be rejected in `/admin` before it ever reaches `workshops`.

### 3. Feature Request

**Signal**: A user wants new functionality.

**Triage actions**:
1. Check `SPEC.md` §10 (Out of Scope for v1). Common ones people ask for: community voting/upvotes (explicitly rejected — see `soul.md`, accuracy-first review model), user accounts, photo uploads, PostGIS, multi-region rate limiting.
2. If not out of scope, run the `soul.md` filter:
   - Does this make a workshop findable faster in an emergency?
   - Does this keep the data accurate?
   - Does this stay consistent with what the Android app reads (same Supabase project)?
   - Does this stay light and free to run?
3. Label: `enhancement` if in scope, `out-of-scope` if not.
4. If it needs specification before implementation: label `needs-spec`.

### 4. Documentation Issue

**Signal**: README, `SPEC.md`, `soul.md`, or setup instructions are unclear, outdated, or missing.

**Triage actions**:
1. Label: `documentation`.
2. Verify by reading the referenced documentation and cross-checking against the actual code (docs drift easily — e.g. a doc claiming a feature exists that's actually in the SPEC.md §10 out-of-scope list).

### 5. Question

**Signal**: The user is asking how something works, not reporting a bug or requesting a feature.

**Common examples**:
- "Bagaimana cara menambahkan bengkel?" / "How do I add a workshop?"
- "Kenapa harus menunggu approval?" / "Why does it need admin approval instead of just appearing?"

**Triage actions**:
1. Answer directly, grounding the answer in `soul.md` where relevant (e.g. "review is admin-only, not community voting, because accuracy matters more than speed for people relying on this in an emergency").
2. If the question reveals a documentation gap, file a separate documentation issue.
3. Close after answering.

### 6. Out-of-Scope Request

**Signal**: The user requests something explicitly listed in `SPEC.md` §10 or ruled out in `CLAUDE.md`.

**Common asks that are Never, not just "not yet"**:
- Community voting/threshold approval (explicitly `../peta-koperasi`'s model, explicitly not this one's — see `CLAUDE.md`).
- Per-user accounts / login for contributors.
- Un-reject / re-review of a submission (status transitions are one-way and terminal by design, to keep `reviewed_at` honest).

**Triage actions**:
1. Label: `out-of-scope`.
2. Respond with the specific rule/section it violates and why (see template below).
3. Close the issue.

---

## Triage Workflow

```
New issue filed
  |
  v
READ the full issue carefully
  |
  v
Is this actually about the Android app (../tambalban), not this site?
  YES -> Redirect, close
  NO  v

CATEGORIZE into one of the 6 types above
  |
  v
LABEL appropriately (type + domain + severity if applicable)
  |
  v
Is it a DUPLICATE?
  YES -> Link to original, explain what it tracks, close
  NO  v

Is it OUT OF SCOPE per SPEC.md §10 or CLAUDE.md's locked rules?
  YES -> Use out-of-scope template, label, close
  NO  v

Does it need MORE INFORMATION?
  YES -> Request specific information, label `needs-info`
  NO  v

RESPOND with appropriate template
  |
  v
Done. Monitor for follow-up.
```

---

## Response Templates

### Data Quality Report Response

```
Terima kasih atas laporannya!

Data yang akurat sangat penting di sini — orang yang membuka peta ini biasanya sedang darurat (ban bocor). Laporan seperti ini kami tanggapi serius.

Perlu diketahui: saat ini tidak ada cara otomatis untuk mengedit atau menghapus bengkel yang sudah tayang di peta (tidak ada tombol "edit" di web ini — lihat SPEC.md §5). Perbaikan data pada tabel `workshops` yang sudah live perlu dilakukan langsung oleh maintainer, karena tabel ini juga dipakai oleh aplikasi Android TambalBan.

Kami akan tindak lanjuti laporan ini. Jika Anda punya info tambahan (foto, alamat yang benar, status tutup permanen/sementara), silakan tambahkan di sini — itu sangat membantu proses perbaikannya.

Terima kasih sudah membantu menjaga data tetap akurat!
```

### Out-of-Scope Feature Request Response

```
Thank you for this suggestion, @{username}!

This is currently out of scope. Specifically, [SPEC.md §10 item / CLAUDE.md rule] rules this out because [specific reason grounded in soul.md — e.g., "review here is admin-only by design, not community-voted, because the data is safety-critical for someone with a flat tire — see soul.md's 'Accuracy Before Speed' value"].

If circumstances change (e.g. submission volume grows past what one admin can review), this could be revisited — but it's not planned for now.

Terima kasih!
```

### Bug Report — Needs More Information

```
Thank you for reporting this, @{username}!

To help investigate, could you share:

1. **Browser/device** (e.g. Chrome on Android, Safari on iPhone)
2. **Steps to reproduce** — what did you do before the issue occurred?
3. **Expected vs actual behavior**
4. **Screenshot**, if possible
5. Were you using the website (browser) or the TambalBan Android app? (They're separate — this repo is the website.)

Jika lebih nyaman menulis dalam Bahasa Indonesia, silakan!
```

### "My Submission Isn't on the Map" Response

This is one of the most common and most understandable points of confusion — worth having a ready answer.

```
Terima kasih sudah menambahkan data!

Kiriman Anda saat ini berstatus "pending" (menunggu review). Berbeda dengan peta komunitas yang pakai voting, di sini setiap kiriman diperiksa satu per satu oleh admin sebelum tampil di peta publik — ini disengaja, supaya data yang dipakai pengendara darurat benar-benar akurat (lihat soul.md).

Setelah disetujui admin, lokasinya akan muncul di peta ini dan juga di aplikasi TambalBan (keduanya berbagi data yang sama). Mohon tunggu — biasanya prosesnya tidak lama.
```

### Duplicate Issue Response

```
Thank you for filing this, @{username}!

This is the same issue as #{original_issue_number}, which tracks [brief description]. Current status: [open/in progress/etc].

Closing this to keep discussion in one place — your report is still valuable, it confirms this affects more than one person. Feel free to add context to the original.
```

---

## Bug Report Quality

### What Information to Request

| Field | Why we need it | How to ask |
|---|---|---|
| Browser/device | Leaflet/map bugs are often browser-specific | "Pakai HP atau komputer? Browser apa?" |
| Website vs Android app | Two separate codebases share data | "Pakai website atau aplikasi Android TambalBan?" |
| Steps to reproduce | Without this, investigation stalls | "Bisa ceritakan langkah-langkahnya?" |
| Expected vs actual | Clarifies bug vs misunderstanding | "Seharusnya apa yang terjadi? Apa yang terjadi?" |
| Screenshot | Worth a thousand words for map issues | "Bisa kirim screenshot?" |

### Interpreting Non-Technical Reports

| What they say | What they likely mean |
|---|---|
| "Peta tidak muncul" | Tiles failed to load, JS error, or `/api/workshops` failed |
| "Tidak bisa kirim" / "Can't submit" | Zod validation rejecting valid-looking input, or rate limit (5/hour/IP) hit |
| "Loading terus" | `/api/workshops` or `/api/geocode` timing out |
| "Error" (no detail) | Ask for a screenshot |
| "Lambat" | Ask which page — map viewport fetch, or geocode search |

---

## Duplicate Handling

1. Search open AND closed issues for similar reports; for data quality reports, check if the same workshop is referenced (by name or approximate location).
2. Link to the original issue number so GitHub cross-references it.
3. Explain what the original tracks and its current status — never close with just "Duplicate."
4. Acknowledge the reporter's effort.

---

## Stale Issue Management

- **Day 60** (no activity): label `stale`, post a check-in comment asking if it's still relevant, note it will close in 14 days if not.
- **Day 74**: close with a note that it's welcome to be reopened or refiled with updated context.

**Do NOT close as stale**:
- Data quality reports about live, wrong/fake workshops — safety-critical data doesn't expire.
- Issues labeled `needs-spec` (waiting on a decision, not abandoned).
- Issues with an active PR reference.

---

## Triage Checklist

```
[ ] Read the full issue
[ ] Confirmed this is about tambalban-web, not the Android app
[ ] Categorized: bug / data-quality / feature-request / documentation / question / out-of-scope
[ ] Labeled: type + domain + severity if applicable
[ ] Duplicate check done (open + closed issues)
[ ] Scope check done against SPEC.md §10 and CLAUDE.md locked rules
[ ] Responded within 3 days using the right template
[ ] If bug: requested missing info if needed
[ ] If data quality: explained there's no self-service edit, flagged for maintainer DB action
[ ] If stale (60+/74+ days): followed the timeline, exceptions respected
```

---

## Exit Criteria

Issue triage is complete when:

1. Every open issue has at least one label.
2. Every issue filed in the last 3 days has a response.
3. No issue was closed without explanation.
4. Duplicates link to their original.
5. Out-of-scope requests are declined with a specific rule/section cited.
6. Data quality reports got the "no self-service edit, flagged to maintainer" explanation.
7. Bug reports missing info have a clear, specific ask.
8. Stale issues are labeled/notified per the timeline, with safety-critical exceptions respected.

---

*A wrong pin on this map can send someone further from help. A dismissed report can do the same. Triage accordingly.*
