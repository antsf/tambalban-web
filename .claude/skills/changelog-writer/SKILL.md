---
name: changelog-writer
description: Write Keep-a-Changelog entries for TambalBan Web in impact-first language, with BREAKING and SHARED SCHEMA prefixes for changes the Android app needs to know about.
---

# Skill: changelog-writer

Write meaningful changelogs for TambalBan Web.

---

## Purpose

Maintain a changelog that communicates project progress to the people who actually depend on it: developers working on this repo or the sibling `../tambalban` Android app, and anyone operating the deployment (checking what changed before trusting a new release with real drivers' safety data). A changelog is the project's record of what changed and why it matters — it must be honest, clear, and useful.

This project follows the [Keep a Changelog](https://keepachangelog.com/) format.

---

## When to Invoke

- A new version is being tagged or released.
- A batch of changes has accumulated in the `Unreleased` section and needs to be organized.
- A PR has been merged that adds a user-visible feature, fixes a bug, changes the API, or changes something in the shared `workshops`/`workshop_submissions` schema.
- A dependency update has user-visible impact (e.g., a `react-leaflet` or `leaflet` upgrade changes map behavior).

## When NOT to Invoke

- Internal refactors with no user-visible impact (do not log "refactored `geo.ts` for readability").
- Test additions or fixes.
- Documentation-only changes (`soul.md`, `SPEC.md`, `CLAUDE.md`, `README.md` edits go in commit history, not the changelog).
- Dependency minor/patch version bumps with no behavior change.
- Changes to dev tooling config (`eslint.config.mjs`, `tsconfig.json`, `postcss.config.mjs`).

---

## Inputs

Before writing a changelog entry, gather:

1. **What changed?** Read the PR description, commit messages, and diff.
2. **Who is affected?** Drivers using the public map, contributors submitting workshops, the admin reviewing the queue, or whoever maintains the Android app on the shared Supabase project?
3. **What is the user-visible impact?** Not what code changed, but what someone now experiences differently.
4. **Is this a breaking change?** Does it change API response shapes, remove a feature, alter the `workshops`/`workshop_submissions` schema in a way `../tambalban` needs to know about, or change existing behavior?
5. **Version context:** Is this going into `Unreleased`, or is a version being tagged?

---

## Outputs

Entries in `CHANGELOG.md` at the project root, following Keep a Changelog format.

---

## Changelog Format

### File structure

```markdown
# Changelog

All notable changes to TambalBan Web will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Removed
- ...

## [0.2.0] - 2026-07-15

### Added
- ...

## [0.1.0] - 2026-06-01

### Added
- ...
```

### Section definitions

| Section | Use for | Example |
|---------|---------|---------|
| Added | New features, new endpoints, new UI elements | "Reverse geocoding auto-fills the address field when placing a pin on `/submit`" |
| Changed | Modifications to existing features, API response shape changes, behavior changes | "Submission rate limit lowered from 10/hour to 5/hour per IP to reduce queue spam" |
| Fixed | Bug fixes | "Fixed: submitting with coordinates outside Indonesia's bounds returned a 500 instead of a clear validation error" |
| Removed | Features or endpoints removed | "Removed the unused `photo` field placeholder from the submission form" |

Do NOT use: `Deprecated`, `Security` (unless there is a genuine security fix — e.g. an admin-auth bypass). Keep the sections to the four above for simplicity.

---

## Writing Changelog Entries

### The impact-first framing rule

Every entry must be written in terms of **impact on the people who use this**, not just technical changes. The reader should understand what changed for them, not what the developer did internally.

**Wrong (technical-only):**
```
- Added debounce to viewport bounds fetch in workshop-map.tsx
```

**Right (impact-first):**
```
- Map now waits briefly after you finish panning before reloading pins, instead of
  firing a request on every frame — smoother on a slow connection
```

**Wrong (technical-only):**
```
- Changed PATCH /api/admin/submissions/[id] to check submission.status before writing
```

**Right (impact-first):**
```
- Approving or rejecting a submission twice (e.g. from a double-click) now safely
  no-ops with a clear error instead of silently creating a duplicate workshop
```

### No bilingual requirement

Unlike a bilingual civic-tech project, TambalBan Web has **no i18n system** — all user-facing text is Indonesian, hardcoded inline. The changelog itself should be written in **English** (it is developer/maintainer-facing documentation, read by whoever maintains this repo and the sibling Android repo), but do not add an Indonesian summary line per entry — there is no established convention for that here and no i18n infrastructure to mirror. Keep entries in plain English.

### Entry writing guidelines

1. **Start with a noun or feature name**, not a verb. "Reverse geocoding: ..." not "Added reverse geocoding: ..." (the section heading already says "Added").
2. **One entry per user-visible change.** If a PR touches 5 files but produces one visible change, that is one entry.
3. **Include the scope.** If the change is API-only, say so: "API: `GET /api/workshops` now returns `source` field." If it's UI-only, say so.
4. **Breaking changes get a prefix.** Use `**BREAKING:**` at the start of the entry:
   ```
   - **BREAKING:** API: `GET /api/workshops` response no longer includes the legacy
     `type` field (removed from the `workshops` table by the Android app's migration)
   ```
5. **Shared-schema changes get a `**SHARED SCHEMA:**` prefix** — this is specific to this project, since `workshops`/`workshop_submissions` are read/written by both this repo and `../tambalban`. Any migration or column change that the Android app needs to know about must be called out distinctly from an ordinary breaking change:
   ```
   - **SHARED SCHEMA:** `workshop_submissions.notes` column added
     (`001_web_submission_fields.sql`) — optional, the Android app can ignore it
     but should not error if it's present in a row it reads.
   ```
6. **Keep entries to one or two lines.** If you need more, the change is either too big for one entry or you are over-explaining.

---

## What Goes in the Changelog

### YES — log these:

- New features visible to users (new page, new UI element, new map behavior)
- New API endpoints or changes to existing endpoint behavior
- Bug fixes that affected users (broken form, submission stuck, map not loading, admin unable to approve)
- Data model changes (new column, changed constraint) — framed as impact, and marked `**SHARED SCHEMA:**` if `../tambalban` needs to know
- Significant dependency updates with user-visible impact (`react-leaflet`/`leaflet`/Next.js major version bump that changes behavior)
- Performance improvements users can feel (map loads faster, submission responds quicker)
- Rate limit or validation rule changes that affect what a contributor can submit

### NO — do not log these:

- Internal refactors (renamed a variable, split a function, moved a file)
- Test additions or modifications
- Documentation-only changes (`README.md`, `CONTRIBUTING.md`, `soul.md`, `SPEC.md`, `CLAUDE.md` updates)
- Dependency minor/patch bumps with no behavior change
- CI/CD pipeline changes
- Linter/formatter config changes
- Code comment additions
- `.gitignore` changes

### Edge cases:

- **Admin-only UI changes** (e.g. tweaking the review queue layout): log if it changes what the admin can do (new bulk action, new filter); don't log a pure visual tweak with identical functionality.
- **Rate limit number changes:** always log — this directly affects what a legitimate contributor experiences ("I got rate-limited faster than before").
- **Major dependency upgrade with no user-visible change:** do not log. If Next.js 17 ships and everything looks the same, it's an internal change.
- **Major dependency upgrade WITH visible change:** log the visible change, not the upgrade. "Map tiles now load progressively" not "Upgraded Leaflet from 1.9 to 1.10."

---

## Version Milestones

This project uses semantic versioning. Suggested milestones (adjust as the project actually progresses — do not treat this table as fixed history):

| Version | Milestone | What it means |
|---------|-----------|----------------|
| 0.1.0 | MVP deploy | Map loads, submission form works, admin can log in and review/approve/reject |
| 0.2.0 | Submission UX improvements | Reverse geocoding, draggable pin, better rate-limit messaging |
| 0.x.x | Pre-1.0 releases | Features accumulating toward stability |
| 1.0.0 | First stable release | All SPEC.md MVP features complete, API surface stable |

**Version tagging rules:**

- Increment PATCH (0.1.x) for bug fixes only.
- Increment MINOR (0.x.0) for new features.
- MAJOR is reserved for 1.0.0 (first stable) and beyond.
- Pre-1.0, breaking changes can happen in MINOR versions — document them clearly with `**BREAKING:**` or `**SHARED SCHEMA:**`.

---

## Thinking Process

### Step 1 — Gather the changes

Read the git log since the last version tag (or the last `Unreleased` review). For each commit or merged PR, ask: "Did this change anything a driver, contributor, admin, or the Android app's maintainers would notice?"

### Step 2 — Categorize

Sort changes into Added / Changed / Fixed / Removed. If a change does not fit any of these, it probably should not be in the changelog.

### Step 3 — Write the impact-first entry

For each change, write the entry from the affected person's perspective.

### Step 4 — Check for breaking changes and shared-schema impact

Any change to API response shape, removed feature, or altered behavior gets `**BREAKING:**`. Any change to `workshops`/`workshop_submissions` columns or constraints gets `**SHARED SCHEMA:**`.

### Step 5 — Order entries by significance

Within each section, order entries from most impactful to least.

### Step 6 — Run the checklist

See below.

---

## Common Changelog Mistakes

### Mistake 1: Git log as changelog

Symptom: the changelog reads like `git log --oneline`. "fix typo in submit-form.tsx" sits next to "add rate limiting to submissions."

Fix: a changelog is curated. If a contributor or the Android team wouldn't care, it doesn't go in.

### Mistake 2: Developer-only language

Symptom: "Refactored `getWorkshopsInBounds` to use a single `.select()` chain instead of two."

Fix: "Map loads slightly faster when panning." The reader doesn't care about the query shape; they care that it's faster.

### Mistake 3: Missing the shared-schema callout

Symptom: a migration adding a column to `workshop_submissions` is logged as a plain "Changed" entry with no signal that the Android team needs to check anything.

Fix: always mark schema changes to `workshops`/`workshop_submissions` with `**SHARED SCHEMA:**`, even if the change is backward-compatible (e.g. a new nullable column) — the Android maintainers should not have to diff migrations to find out.

### Mistake 4: Logging every dependency bump

Symptom: half the changelog is "Updated next from 16.3.0 to 16.3.1."

Fix: only log dependency changes with user-visible impact.

### Mistake 5: Hype without accuracy

Symptom: "Massive submission flow overhaul!" when the actual change was adding one optional field.

Fix: state facts. "Submission form: added an optional notes field (e.g. for tubeless tire service, distinguishing landmarks)." Let the reader assess significance.

---

## Example Changelog Entries

### Good entries:

```markdown
## [Unreleased]

### Added
- Reverse geocoding: placing a pin on `/submit` now auto-fills the address field
  from OpenStreetMap, editable if it's wrong
- Draggable pin and camera/gallery photo dropzone on the submission form
- Manual latitude/longitude number inputs as a fallback to dragging the map pin

### Changed
- **SHARED SCHEMA:** `workshop_submissions` gained `notes`, `reviewed_at`, and
  `approved_workshop_id` columns (`001_web_submission_fields.sql`) — the Android
  app does not need to write these, but should not error on rows that have them
- Submission rate limit is now 5 requests/hour per IP (was unlimited)

### Fixed
- Approving the same submission twice (e.g. via a double-click) now correctly
  returns a 409 instead of creating two workshop entries
- Fixed: coordinates just outside Indonesia's bounds were silently clamped instead
  of rejected with a clear error

### Removed
- Removed the custom branding placeholder favicon, replaced with the merah putih
  favicon and OG image
```

### Bad entries (do not write these):

```markdown
- Added @next/bundle-analyzer to devDependencies  ← internal tooling, no user impact
- Updated README  ← documentation change, does not belong in changelog
- Refactored validation.ts  ← internal refactor
- Fixed lint errors  ← internal quality
- Bumped zod from 4.4.2 to 4.4.3  ← no user-visible change
- Revolutionary new submission experience!!!  ← hype, unprofessional
```

---

## Checklist

```
[ ] Every entry describes user-visible impact, not implementation details
[ ] Entries are categorized correctly (Added / Changed / Fixed / Removed)
[ ] Breaking changes are prefixed with **BREAKING:**
[ ] Any change to workshops/workshop_submissions schema is prefixed with **SHARED SCHEMA:**
    and states clearly whether the Android app needs to act on it
[ ] Entries within each section are ordered by significance (most important first)
[ ] No internal refactors, test changes, or doc-only changes included
[ ] No dependency bumps without user-visible impact included
[ ] No hype or marketing language — facts only
[ ] Version number follows semver (PATCH for fixes, MINOR for features, MAJOR for 1.0+)
[ ] Date format is ISO 8601 (YYYY-MM-DD)
[ ] Unreleased section exists at the top for work-in-progress
[ ] Each entry is 1-2 lines maximum
[ ] Git log has been reviewed — no notable user-visible changes were missed
[ ] No Indonesian summary lines added (this project has no i18n convention to mirror)
```

---

## Integration with Other Skills

| Condition | Invoke |
|-----------|--------|
| New feature documented in changelog | Consider whether `README.md` needs updating too |
| API change logged | `api-doc-generator` to update `/docs/api.md` and inline JSDoc |
| Version being tagged | Review full Unreleased section, move to versioned section |
| Breaking change or shared-schema change logged | Verify `../tambalban`'s own CLAUDE.md/schema notes are consistent |
| Repository release process | `github-maintainer` for the release-tagging steps |

---

## Exit Criteria

A changelog update is complete when:

1. Every user-visible change since the last entry is represented.
2. Entries are categorized into the correct section (Added/Changed/Fixed/Removed).
3. Breaking changes are clearly marked with `**BREAKING:**`.
4. Any `workshops`/`workshop_submissions` schema change is clearly marked with `**SHARED SCHEMA:**` and states the Android-app impact.
5. No internal-only changes are included.
6. Entries are written in impact-first language.
7. The checklist above is fully checked.
8. If a version is being tagged: the version number is correct per semver, the date is today's date in ISO format, and the Unreleased section is empty (or contains only truly unreleased work).

---

*A changelog is a record of trust for a safety tool. Write it for the next person deciding whether to trust this release with a stranded driver's data.*
