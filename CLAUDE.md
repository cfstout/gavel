# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Electron + Vite with hot reload
npm run build        # tsc && vite build && electron-builder (full production build)
npm run lint         # ESLint with zero-warnings policy
npx tsc --noEmit     # Type-check only (fast validation)
npx vite build       # Build renderer + main + preload without packaging
```

No test framework is configured. Validate changes with `npx tsc --noEmit` and `npm run lint`.

## Architecture

Gavel is an Electron desktop app: a kanban-style PR inbox with Claude-powered code review.

### Process Boundary

**Electron main process** (`electron/`) — all system access lives here:
- CLI wrappers: `github.ts` (spawns `gh`), `claude.ts` (spawns `claude`), `slack.ts` (direct HTTP)
- `polling.ts` — background timer that checks sources for new PRs, detects status changes (new commits, merges), with rate-limit backoff
- `inbox.ts` — inbox state persistence to `inbox-state.json`
- `ipc.ts` — registers all `ipcMain.handle()` handlers
- `preload.ts` — exposes `window.electronAPI` via `contextBridge` (context-isolated)

**Renderer** (`src/renderer/`) — React UI, no direct system access:
- `App.tsx` — screen-based navigation: inbox → pr-input → persona-select → analyzing → review
- Zustand stores: `inboxStore.ts` (PR list, sources, polling state), `reviewStore.ts` (active review session, comments, auto-save)
- All system calls go through `window.electronAPI.*` which maps to IPC handlers

**Shared types** (`src/shared/types.ts`) — contracts between main and renderer, including the `ElectronAPI` interface that both preload and renderer reference.

### Adding New IPC Methods

When adding a new capability that requires main process access:
1. Add the function to the relevant `electron/*.ts` module
2. Register a handler in `electron/ipc.ts`
3. Expose it in `electron/preload.ts`
4. Add the type signature to `ElectronAPI` in `src/shared/types.ts`

### Data Flow

PRs enter via polling (`searchPRs` for GitHub sources, `fetchSlackPRs` for Slack) → deduplicated by `owner/repo#number` → stored in `InboxPR[]` → rendered in kanban columns. Status checks move PRs between columns (reviewed → needs-attention on new commits, any → done on merge/close).

Review flow: select PR → choose persona → Claude analyzes diff → comments staged locally → user approves/rejects/refines each → batch-posted to GitHub via `gh api`.

### State Persistence

- `inbox-state.json` — PR list, sources, poll timestamps. Done PRs auto-clear after 24h, ignored PRs after 7d.
- `review-state.json` — active review session (PR data, comments, selected persona). Auto-saved on comment changes with 1s debounce. Restored on app restart.

### Persona System

Markdown files with YAML frontmatter (`name`, `description`). Built-in personas ship in `/personas/`. User personas go in platform-specific app data dir (e.g., `~/Library/Application Support/gavel/personas/`). Content is the full prompt passed to Claude CLI.

## Path Aliases

Configured in both `vite.config.ts` and `tsconfig.json`:
- `@` → `./src`
- `@shared` → `./src/shared`

## Key Conventions

- All GitHub operations use `gh` CLI (not direct API calls), spawned via `child_process.spawn`
- Claude operations use `claude` CLI, also spawned
- Slack is the exception: direct HTTP to `slack.com/api` with user OAuth token (stored via Electron safeStorage)
- PR references throughout the codebase use either URL format (`https://github.com/owner/repo/pull/123`) or short format (`owner/repo#123`), parsed by `parsePRReference()` in `github.ts`
