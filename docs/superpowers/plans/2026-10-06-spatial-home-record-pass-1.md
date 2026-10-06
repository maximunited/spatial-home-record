# Spatial Home Record — Pass 1 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans (or subagent-driven-development) task-by-task after the user approves execution.

**Goal:** Stand up a new repo with the Spatial Home Record design spec, core data model migrations, and a navigable Next.js shell against real Postgres data.

**Architecture:** Structured scene in Postgres is the source of truth (stable entity IDs, per-attribute confidence, evidence, relationships, documents, HA export profiles). The web shell is selection-driven (tree ↔ detail panel ↔ stub routes). GLB and Home Assistant packages are deferred generated views.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, Neon Postgres, S3-compatible blob pointers (schema only in pass 1), Clerk (private-by-default; dev bypass if unset), Vitest.

**Source of truth for product intent:** Notion comment “Spatial Home Record — Complete Product Vision” on [Apartment 3D Walkthrough](https://app.notion.com/p/Apartment-3D-Walkthrough-3f188c00081480769d70fa1f8c74a376).

## Global constraints

- Pass 1 = spec + schema + shell only (no Three.js walkthrough, no OCR/CV, no HA package zip, no share links).
- Confidence is per-attribute: `confirmed | supported | estimated | unknown | conflicted`.
- Never embed Home Assistant credentials in exports or the DB.
- Repo path: `C:\Users\Maxim\Projects\spatial-home-record`.
- Call `move_agent_to_root` immediately after the folder exists, before any project files.

## File map (pass 1)

- `docs/superpowers/specs/2026-10-06-spatial-home-record-design.md` — approved design
- `docs/superpowers/plans/2026-10-06-spatial-home-record-pass-1.md` — this plan (checked into repo on execute)
- `drizzle/` + `src/db/schema.ts` — tables from design §2
- `src/lib/confidence.ts`, `src/lib/anchors.ts`, `src/lib/relationships.ts` — domain guards
- `src/app/...` — routes from design §3
- `scripts/seed-living-room-stub.ts` — stub entity tree
- `tests/` — unit + integration smoke

## Execution sequence

### 1. Create repo and move workspace
- Use `cursor-app-control` `create_repo` at `C:\Users\Maxim\Projects\spatial-home-record`.
- Immediately `move_agent_to_root` to that path.
- Add `.gitignore` (Node, `.env*`, `.next`).

### 2. Write and commit design spec
- Write `docs/superpowers/specs/2026-10-06-spatial-home-record-design.md` capturing §§1–4 (architecture, schema, shell routes, done criteria, non-goals, living-room vertical slice as **pass 2** north star).
- Self-review: no TBDs, confidence-per-attribute explicit, HA deferred clearly.
- Commit: `docs: add spatial home record design spec`.

### 3. Scaffold Next.js app
- `create-next-app` (TS, App Router, ESLint, no unnecessary boilerplate UI kits).
- Add Drizzle, Neon serverless driver, Vitest, Clerk packages.
- Env template: `DATABASE_URL`, `NEXT_PUBLIC_CLERK_*` (optional), `BLOB_*` placeholders.
- Commit: `chore: scaffold next.js app shell`.

### 4. Implement schema + migrations (TDD on domain types first)
- Tests for confidence enum, wall-local anchor shape, relationship type allowlist.
- Drizzle tables: `projects`, `entities`, `entity_attributes`, `evidence`, `evidence_links`, `blobs`, `documents`, `document_links`, `relationships`, `measurements`, `capture_tasks`, `ha_export_profiles`, `model_snapshots`.
- Generate/apply migration against Neon (or local Postgres if Neon not configured yet—prefer Neon via existing MCP when available).
- Commit: `feat: add core spatial entity schema`.

### 5. Data access + seed
- Server helpers: create project, list entities by project, get entity with attributes/relationships.
- Seed script: one project, living-room stub (room, media wall, floor region, TV, cabinet/shelf/box, 1–2 technical points, sample attributes with mixed confidence).
- Commit: `feat: seed living-room stub entities`.

### 6. App shell routes
- Implement routes from §3 with shared layout: left tree, center placeholder, right detail panel.
- Wire selection by entity ID; empty sections hidden.
- Wall / walkthrough / capture / search / HA export pages as stubs that read real IDs/metadata where useful.
- Clerk middleware: protect `/projects/*` when keys present.
- Commit: `feat: add project shell routes and detail panel`.

### 7. Verify pass-1 done criteria
- Unit + integration tests green.
- Manual smoke: create/open project, expand stub tree, open entity detail, hit stub routes.
- Commit plan copy under `docs/superpowers/plans/`.
- Optional: Cursor Origin remote via `new-repo` / `origin` skill if user wants hosting in the same session.

## Pass 2 (explicitly out of this plan)
Living-room vertical slice: parametric/manual geometry editor, real photo uploads, wall elevation UX, search navigation, isometric HA Picture Elements package with light/blind/fan overlays, re-export profile preservation.
