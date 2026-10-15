# BenchPilot

**Plan it. Build it. Track it.** BenchPilot is an offline-first workshop planner for Windows, Android, and iPhone. It includes a dashboard, projects, reusable versioned builds, stock inventory, project parts and an automatically grouped cut list, a measurement calculator, and local backup/restore. Signed-in users can sync a private workshop snapshot across devices through Supabase.

## Start the app

Double-click **Start BenchPilot.cmd**. It opens the hosted HTTPS app in a compact Chrome or Edge window. The original Jabo Workshop launcher filename remains available for existing shortcuts and opens the same app.

## Install on a phone

BenchPilot can be installed on Android and iPhone as a standalone, offline-first app. Open [the BenchPilot Pages site](https://ajabo1113-sudo.github.io/benchpilot-mobile/) once on the phone while connected, and install it from the browser:

- **iPhone:** Open the BenchPilot page in Safari, tap **Share → Add to Home Screen**, then tap **Add**.
- **Android:** Open the BenchPilot page in Chrome and tap **Install app** (or **Add to Home screen**) in the browser menu.

After the first visit, the app shell is cached on the phone and opens without a connection. Workshop data is stored in that browser on that device and, when signed in, syncs with the user's private Supabase account while online. Offline edits stay on the device and sync when the connection returns. Keep a backup from **Settings** if you need to move or protect records. Clearing the browser's website data removes that device's local copy.

To move existing workshop data from the old local Windows version to the hosted app, download a backup in the old app's **Settings**, then restore it in the hosted app's **Settings** while signed in. The first sign-in can also claim existing browser data on that same browser profile; separate browsers and devices have separate local storage.

The phone version uses the installed browser's web app support rather than separate App Store or Play Store packages. On Windows, the launcher opens this same HTTPS site so it can use the same account and cloud data.

## Cloud sync setup

The Supabase browser client uses the project's **publishable** key from `supabase-config.js`. That key is public by design; access is protected by the per-user Row Level Security policies in `supabase/schema.sql`. Run that SQL in the Supabase SQL Editor before signing in. In **Authentication → URL Configuration**, set the Site URL and Redirect URL to `https://ajabo1113-sudo.github.io/benchpilot-mobile/` so email confirmations return to BenchPilot. Never put a database password, `service_role`, or `sb_secret_...` key in app files. Each Supabase account gets its own cloud record. Local changes save first and sync while online. On first sign-in, local records upload if the account has no cloud copy; if a cloud copy already exists, BenchPilot asks which copy to keep. If the device and cloud later change separately, it pauses sync and asks again instead of silently replacing either copy.

The hosted site and Supabase project must be deployed/configured before cloud sync works. Authentication and service workers require a secure web origin. The former `file://` local-storage data is separate from the hosted app's browser storage; export a JSON backup from the former local app and restore it in the hosted app if you need those records.

## Your data

Projects are saved in the current browser's local storage on that device. Use **Settings → Download backup** to save a portable JSON copy, and **Settings → Choose file** to restore a backup. Restore checks the file's record structure before replacing data and downloads a copy of the current workshop first. Backups created by Jabo Workshop remain supported. If saved data cannot be read, or an upgrade cannot be saved, BenchPilot pauses writes and offers a recovery copy. Recovery copies use a `.json` extension and can be selected directly in **Choose file**; malformed or unsupported files are refused without replacing the current data. A browser reset or clearing browser data can still remove the local copy, so keep backups somewhere safe. Newly created records use stable UUID identifiers for future data portability.

## Measurements

Part lengths and stock dimensions are entered and stored as numeric inches. In Settings, switch between inches and millimeters, and between fractional and decimal displays for inches. Decimal input such as `11.25`, mixed fractions such as `11 1/4` and `11-1/4`, and fractions such as `3/4` are supported in inches. The calculator adds and subtracts measurements using the selected units.

Part thickness comes from the selected stock item. Part width is optional; a blank width uses the stock's full width. A selected width is laid out as a narrower piece cut from the stock.

Materials are recorded as lumber, plywood, or other wood, with length × width × thickness and an on-hand count. Inventory can be filtered by stock type and thickness. Project parts can filter stock choices by those same fields. The cut planner packs each part's length and width onto stock boards or sheets and honors the project's end tolerance and project-specific saw kerf. Kerf is adjusted in that project's **Cut List** area; it defaults to 1/8 inch and is included as spacing between neighboring cuts. The Materials page pools cuts across unfinished projects so shared stock pieces can be planned together; it uses the largest end allowance and kerf among those projects. The optional cut drawing shows a top view with red dotted part outlines; the project print action includes it when enabled, along with the project materials summary and board-by-board cut list. The placement heuristic does not track grain direction or retain usable remnants as separate inventory. Review the layout before cutting.

**Builds** are reusable assemblies with an editable draft and immutable finalized versions. Use **Builds → New build**, then add or edit parts in the v1 draft. Part edits are stored locally as draft changes and do not create new versions. **Save draft** sets a checkpoint; **Finalize** locks the draft as a version. Editing a finalized build starts a draft for the next version. Leaving after changes since the last checkpoint prompts you to save, discard those changes, or keep editing. Duplicate creates an independent build. Adding a build to a project records its selected finalized version and quantity. Projects continue using that pinned version until you explicitly update them. The project parts table and cut planner include the selected build's multiplied quantities. Archived builds remain available to projects that already use them.

Older project data is upgraded locally when the app opens. Existing free-text part materials are kept; edit those parts to connect them to a stock item and include them in board estimates.

## Project files

- `index.html` — application shell
- `styles.css` — interface and responsive layout
- `app.js` — project behavior, local storage, measurement parsing, import/export
- `manifest.webmanifest`, `sw.js`, and `icon-*.png` — phone installation details, offline app shell, and home-screen icons
- `supabase-config.js` and `supabase/schema.sql` — public client configuration and per-account access-controlled cloud table
- `vendor/supabase.min.js` — locally cached Supabase JavaScript client for offline launches
- `Launch BenchPilot.ps1` and `Start BenchPilot.cmd` — current Windows app launchers
- `Launch Jabo Workshop.ps1` and `Start Jabo Workshop.cmd` — legacy launcher filenames retained for existing shortcuts
