# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IdeaNode is a **Tauri v2 desktop application** for managing categories and memos with rich text editing, drag-and-drop organization, and local SQLite persistence. The app supports multi-window workflows (main window, archive window, memo editor windows) with real-time synchronization via Tauri events.

**Tech Stack:**
- Frontend: React 19 + TypeScript + Vite
- Desktop: Tauri v2 (Rust backend)
- Database: SQLite (rusqlite with bundled)
- State: Zustand
- DnD: dnd-kit
- Editor: TipTap

## Language Policy

**IMPORTANT:** This project follows Korean language conventions:
- **All explanations and communication with users must be in Korean (한국어)**
- **All code comments must be written in Korean (한국어)**
- When writing new functions, components, or any code, include Korean comments explaining the logic
- When discussing code changes or implementations, use Korean language

## Development Commands

### Running the App
```bash
# Development mode (from root or IdeaNode/ directory)
npm run tauri dev

# From root directory
npm run dev
```

### Building
```bash
# Frontend build with TypeScript check
npm run build

# Build Tauri app (production)
npm run tauri build
```

### Type Checking
```bash
# Frontend TypeScript
npm run build  # includes tsc check

# Rust backend
cd src-tauri
cargo check
```

### Testing Rust
```bash
cd src-tauri
cargo test
```

## Architecture

### Frontend-Backend Communication

The frontend communicates with Rust backend through **Tauri commands** defined in `src-tauri/src/commands.rs`. All API calls are typed and wrapped in `src/lib/tauri.ts`:

```typescript
// Frontend calls Rust command
import { api } from "../lib/tauri";
await api.createMemo(input);
```

Rust commands are registered in `src-tauri/src/lib.rs` and use a shared `DbState` for SQLite access.

### State Management Pattern

The app uses **Zustand** (`src/store/appStore.ts`) as the single source of truth:
- All CRUD operations call Tauri commands → refresh from DB → emit `ideanode:data_changed` event
- Multi-window sync: All windows listen to `ideanode:data_changed` and refresh their state
- No optimistic updates - always refresh from SQLite after mutations

### Multi-Window Architecture

Three window types managed by Tauri:
1. **Main window** (`main`): Category grid with memos
2. **Archive window** (`archive`): View and restore archived categories/memos
3. **Memo editor window** (`memo`): Dedicated TipTap editor with auto-save

**Important:** When opening a memo editor, the app **closes all existing memo windows** before creating a new one to ensure single-editor UX stability (see `CategoryCard.tsx` and `SortableMemoRow.tsx`).

### Database Schema

SQLite database at `{appDataDir}/ideanode.sqlite3` with migration system using `PRAGMA user_version` (currently v5):

**Tables:**
- `categories`: id, emoji, title, color, position, is_collapsed, archived, is_todo
- `memos`: id, category_id, emoji, title, color, date_ymd, content_md (stores HTML), todo_done, position
- `settings`: key-value store (e.g., background_color)

**Migrations** are handled in `src-tauri/src/db.rs` via `run_migrations()`.

### Drag-and-Drop System

Uses `@dnd-kit/core` and `@dnd-kit/sortable`:
- **Category reordering**: Grid-level DnD in `CategoryGrid.tsx`
- **Memo reordering**: Within a category in `SortableMemoRow.tsx`
- **Memo moving**: Between categories (uses `moveMemo` command)
- **Search disable**: DnD is disabled during search to prevent confusion

Visual feedback via `DragOverlay` and drop target highlighting (see `App.css`).

### Auto-Save Pattern

Both category settings and memo editors use **debounced auto-save** (1.2s default):
- Changes trigger debounced save to DB
- On close/unmount, flush any pending saves immediately
- For new memos, a draft is created immediately to prevent data loss

See `CategorySettingsModal.tsx` and `MemoWindow.tsx` for implementation.

### Color System

Two color types:
1. **Text color** (`color` field): Applied to category/memo titles (not dots), 12 presets in `TEXT_COLOR_PRESETS`
2. **Background color** (app-wide): 20 presets in `BACKGROUND_COLOR_PRESETS`, stored in settings, applied via CSS variable `--bg`

Color picker UI: Small circle chip to the right of title input fields → opens `AnchoredPopover` with presets.

### Portal/Popover Pattern

`AnchoredPopover.tsx` renders popovers via React portal to `document.body` to prevent clipping by modal/window boundaries. Used for:
- Emoji pickers
- Color pickers

Position is calculated relative to anchor element with viewport clamping.

## Key Files and Their Roles

### Frontend Structure (`src/`)
- **`App.tsx`**: Root component, handles initial data load and background color CSS variable
- **`store/appStore.ts`**: Zustand store with all CRUD actions and event emission
- **`lib/tauri.ts`**: Typed wrappers for Tauri invoke calls
- **`types.ts`**: Frontend TypeScript types matching Rust models

### Features (`src/features/`)
- **`categories/CategoryGrid.tsx`**: Top bar (search, create, color palette), category grid, DnD context, delete confirmation
- **`categories/CategoryCard.tsx`**: Single category card with memo list, collapse/expand, add memo button
- **`categories/CategorySettingsModal.tsx`**: Edit category (title/emoji/color), auto-save, archive/restore
- **`memos/SortableMemoRow.tsx`**: Memo row in category with DnD, checkbox for todo items
- **`memos/MemoEditorModal.tsx`**: Legacy modal-based editor (reference only, not primary UX)

### Windows (`src/windows/`)
- **`ArchiveWindow.tsx`**: Dedicated window for browsing/restoring archived categories
- **`MemoWindow.tsx`**: Dedicated TipTap editor window with auto-save, ESC to close

### Components (`src/components/`)
- **`Modal.tsx`**: Base modal component with dim-click-to-close, Enter key submission
- **`ColorPicker.tsx`**: Preset-based color picker (text + background)
- **`EmojiPicker.tsx`**: Emoji selection with manual input fallback
- **`AnchoredPopover.tsx`**: Portal-based popover with anchor positioning

### Rust Backend (`src-tauri/src/`)
- **`lib.rs`**: Tauri entry point, DB initialization, command registration
- **`db.rs`**: SQLite connection, migration system, schema setup
- **`models.rs`**: Rust structs with serde for JSON serialization
- **`commands.rs`**: All Tauri commands (CRUD, reordering, settings)

## Common Patterns

### Adding a New Tauri Command

1. Add Rust function in `src-tauri/src/commands.rs`:
```rust
#[tauri::command]
pub fn my_command(state: State<DbState>, input: MyInput) -> Result<MyOutput, String> {
    // implementation
}
```

2. Register in `src-tauri/src/lib.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    my_command,
    // ...
])
```

3. Add TypeScript wrapper in `src/lib/tauri.ts`:
```typescript
myCommand(input: MyInput): Promise<MyOutput> {
    return invoke("my_command", { input });
}
```

4. Add store action in `src/store/appStore.ts` that calls the command and refreshes state.

### Adding a Database Migration

Edit `src-tauri/src/db.rs` in `run_migrations()`:
1. Increment target version
2. Add new version case with SQL statements
3. Handle existing data if needed

The app will auto-migrate on next launch.

### Creating a New Modal

Use `Modal` component from `src/components/Modal.tsx`:
```tsx
<Modal
    isOpen={isOpen}
    onClose={onClose}
    title="My Modal"
    submitOnEnter={true}
>
    {/* content */}
</Modal>
```

Modals support dim-click-to-close and Enter key submission for primary actions.

## UX Principles

1. **Hover-only icons**: Action buttons appear only on hover to reduce visual clutter (see `.hover-only-icons` in `App.css`)
2. **Search disables DnD**: When search is active, drag-and-drop is disabled to prevent confusion
3. **Confirm destructive actions**: Use in-app confirmation modals (not `window.confirm`) for deletions
4. **Auto-save everywhere**: No explicit save buttons in editors - changes save automatically with debounce
5. **Single memo editor**: Only one memo window open at a time - opening a new memo closes existing editors
6. **Event-based sync**: All data mutations emit `ideanode:data_changed` for cross-window synchronization

## Project Structure Notes

- Root `package.json` is a monorepo wrapper that proxies commands to `IdeaNode/`
- All development happens in `IdeaNode/` directory
- Vite config includes manual chunk splitting to optimize bundle size (see `vite.config.ts`)
- TypeScript is configured with strict mode and unused variable checks
- The app is versioned (currently v0.2.1) - update in both `package.json` and `src-tauri/Cargo.toml`

## Date Format

Dates are stored as `YYYY-MM-DD` strings in SQLite but displayed as `YY. M. D` format (e.g., "25. 1. 27") using the utility in `src/lib/date.ts`.
