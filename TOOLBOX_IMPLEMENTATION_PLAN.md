# BenchPilot Toolbox implementation plan

## Current application review

- **Runtime:** Vanilla JavaScript, HTML, and CSS. There is no package manager, bundler, or test runner; the static app is also a PWA served from GitHub Pages and the Windows launcher.
- **Navigation and pages:** `index.html` owns the primary navigation. `app.js` owns page selection, HTML rendering, and delegated events in one closure. The mobile bottom navigation currently has six entries, so adding a seventh without a responsive navigation decision would make it cramped.
- **Existing functionality to preserve:** Dashboard, Projects, versioned Builds, Materials and project allocations, cut planning and saw kerf controls, measurement parsing, local backup/restore, workshop profile, and cloud account/sync UI. The current cut calculator must remain reachable.
- **Persistence and safety:** The complete workshop is stored in localStorage under a deliberately stable legacy key. The Toolbox foundation migration advances `STATE_VERSION` from 10 to 11 and adds only an ordered tool preference. Loading validates and upgrades prior snapshots; a failed read or migration pauses writes to preserve the original. Backups export the complete snapshot.
- **Cloud and accounts:** Authenticated accounts sync one JSON snapshot to `public.user_workshop`. RLS scopes the row to `auth.uid()`. Local changes save first and cloud synchronization handles whole-snapshot revisions/conflicts. There is no record-level sync or file-storage layer yet.
- **Preferences and Dashboard:** Settings are normalized through an allow-list. Dashboard widget IDs are registered centrally, rendered by `renderDashboardWidget`, and the selected ordered IDs are stored in `settings.dashboardWidgets`. Drag/drop and accessible move-up/down controls already exist.
- **Current data model:** Root collections are projects, materials, and builds. Projects have embedded parts and optional free-text notes; builds contain drafts and immutable versions; project build assignments retain a version snapshot. IDs are UUIDs. Existing records have some creation/update timestamps, but there is no common record metadata contract.
- **Attachments:** The shop logo is a resized data URL in the synced snapshot. That is workable for one small image but should not be copied for equipment photos or model files; large binary data would inflate localStorage and every cloud sync.
- **Maintenance, equipment, notes, labels, and QR:** These systems do not exist yet. There is no generic notes collection, equipment collection, maintenance relationship, label template model, QR/deep-link route, or attachment store.

## Recommended architecture and product decisions

1. **Keep the current app and add a small application/data layer in place.** Do not rewrite the static PWA. Start extracting storage, validation, migration, and repository operations from the render/event code in `app.js` into small plain-JavaScript modules while keeping existing record formats readable.
2. **Use a shared tool registry.** Define each Toolbox tool once with its stable ID, title, description, icon, renderer, and optional Dashboard widget renderer. Store only the ordered visible IDs in user settings. Hiding a tool changes the layout, never its data. Reuse existing Dashboard customization patterns and provide move-up/down controls on touch screens.
3. **Keep the mobile navigation usable.** Replace the standalone Cut calculator navigation entry with Toolbox, and expose the existing calculator as a Toolbox card. Preserve its Dashboard widget and calculator page route. This keeps the mobile bar from growing beyond its current six entries.
4. **Separate utility state from durable workshop records.** Converters and calculators should be stateless or save explicitly named calculations. Stopwatch/timer state should persist start/deadline timestamps and paused durations, then derive remaining time on render; an interval should only refresh the display.
5. **Use shared record conventions for new durable data.** Equipment, maintenance, notes, and label templates should receive stable UUIDs plus `createdAt`, `updatedAt`, and an archive/delete marker. Maintenance references one equipment ID. A shared note record may reference a nullable project ID or build ID; project/build views should render those same records. Preserve existing project free-text notes through an explicit, tested migration rather than dropping or duplicating their text.
6. **Plan attachment storage before photos.** Keep metadata (record ID, owner/workshop ID, file name, MIME type, size, checksum, and storage path) in workshop records. Store offline binaries in IndexedDB, then add a separate Supabase Storage sync path when ready. Do not put equipment photos in the JSON snapshot. Logo data can remain compatible until a separate migration is justified.
7. **Make QR codes point to stable record routes.** Encode a durable record type and UUID, not editable names or serial numbers. The app must resolve the route only after local/account authorization; the code itself must reveal no private record contents. Use one shared QR capability for future equipment and storage labels.
8. **Keep snapshot sync for the first Toolbox milestone.** Toolbox layout and small records can initially use the existing per-account snapshot with backward-compatible optional collections. Before extensive photo use or multi-user concurrent editing, move toward per-record repositories and revision-aware sync. Do not add Supabase tables or Storage buckets as part of the first Toolbox increment.
9. **Build calculator logic as pure functions.** Use canonical base units internally, validate dimensions and divide-by-zero cases, and format output using existing measurement preferences. Test imperial/metric, area, volume, weight, temperature, and fractional-inch formatting independently from page rendering.

## Milestones

### 0. Foundation (first implementation milestone)

**Status: implemented.**

- Add a Toolbox route and responsive landing page.
- Move the existing Cut calculator entry into the Toolbox while retaining its route and Dashboard widget.
- Create a tool registry and persist the ordered visible tool IDs in settings, including migration defaults for existing users.
- Add customization mode with drag/drop on desktop, move controls on mobile, hide/restore, and reset.
- Verification: static JavaScript syntax and diff checks are run before publishing. Manual sign-in cloud round-trip and phone navigation still need product-owner review after deployment.

### 1. Core utilities

**Status: implemented.**

- Measurement converter supports length, area, volume, weight, and temperature categories.
- Area/volume, angle/slope, and weight/quantity calculators update as their inputs change and have copyable results.
- Calculator results are intentionally transient; saved named calculations and reusable item-weight presets are deferred.
- Dashboard widgets for the new tools are deferred until the utilities can share tested business logic with the Dashboard renderers.

### 2. Time tools and notes

**Time tools: implemented. Notes: deferred.**

- Stopwatch and up to 20 independent timers store timestamps/durations in the existing settings snapshot. Timers remain accurate across navigation, refresh, and app suspension.
- Timers show an in-app completion alert when BenchPilot is open. OS/browser notifications are not requested; closed-app notifications are deferred.
- Shared notes collection and one-record project/build integration are deferred because migrating existing free-text project notes needs a backwards-compatible rollout plan.

### 3. Equipment and maintenance

- Equipment inventory, search/filter, grid/list, custom categories/locations, detail and archive/restore.
- Maintenance records referencing equipment IDs, schedule/dashboard views, completion history.
- Establish IndexedDB attachment storage before adding equipment photos.

### 4. Shared QR and labels

- Shared record link/QR service and permission-aware record routing.
- Label editor/templates, source-record fields, print calibration, and labels for equipment/materials/storage locations.

### 5. Dashboard and cross-device hardening

- Add direct-use widgets through the shared registry and shared business logic.
- Review sync conflict behavior and snapshot growth. Add record-level repositories and cloud file sync only when required by real usage.
- Full desktop/mobile, offline, account isolation, backup/restore, and regression review.

## Deferred work from the brief

- **Equipment inventory and maintenance:** Deferred to a separate milestone so their stable record IDs, archive semantics, categories/locations, and maintenance links can be defined and tested together. Equipment photos are out of scope; no file-storage work was introduced.
- **Shared notes:** Deferred until a safe migration can preserve existing project note text and render one shared note record in Projects and Builds without duplicating content.
- **QR codes and label generator:** Deferred until stable record routes and account authorization can be verified. A printed QR code must not expose private records to signed-out users.
- **Dashboard widgets for the new tools:** Deferred until each tool has shared calculation functions and direct-use widget behavior; shortcut-only widgets would not meet the product brief.
- **Background timer notifications:** Deferred because they require browser notification permission and browser/platform behavior varies. In-app alerts work while BenchPilot is open.
- **Saved calculations and item-weight presets:** Deferred; current calculator inputs/results are intentionally transient.

## Verification approach

- Preserve known-good backups and add backward-compatible migrations before introducing any new collections.
- Check each migration against empty data, a version-10 local backup, and cloud snapshot import/export.
- Verify hide/restore/reorder across refresh and signed-in devices; hidden items must not remove records.
- Verify timers after route changes, refresh, app suspension, and reopening.
- Verify note identity across Toolbox, Project, and Build views.
- Verify equipment archive/restore and maintenance references; reject orphan maintenance records.
- Verify QR routes do not disclose data when signed out or under a different account.
- Verify print dimensions and labels on desktop and phone layouts.
- Keep the existing projects/builds/materials/cut-list workflows and recovery behavior working at every stage.

## Main risks and choices to revisit

- **Single-snapshot sync:** Every edit currently uploads a whole workshop document. Large notes/photo collections can increase payload size and make concurrent edits harder to merge. Start with small records and revisit repository/sync granularity before files or heavy collaboration.
- **Photo storage and offline use:** IndexedDB plus later Storage upload/download queue is more work than storing a data URL, but avoids localStorage quota failures and repeated binary upload. Introduce it only with Equipment photos.
- **Legacy notes:** Existing project notes are plain text on the project record. Converting them into shared notes needs a carefully tested migration and a decision on how the older field remains readable by older app versions.
- **QR access:** A printed code may be scanned while signed out. The safe default is to resolve it only inside BenchPilot after sign-in; public sharing would need a separate explicit feature and policy.
- **Scope:** The complete brief is a sequence of feature programs, not one release. Each milestone should be reviewable before starting the next, especially before the notes migration, file storage, and record-level sync changes.

## Repository inspection notes

This plan is based on `index.html`, `app.js`, `styles.css`, `sw.js`, `README.md`, and the Supabase migration/schema. Toolbox layout and timer settings are backward-compatible local snapshot migrations through state version 12; no database schema or existing project/material/build records were changed.
