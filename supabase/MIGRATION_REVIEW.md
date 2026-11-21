# Supabase migration review

## Status

The initial migration was applied and inspected on the **local Docker Supabase stack**. The hosted project reference `tjanuvjmmrxltzwezccw` (BenchPilot, Ohio) matches `supabase-config.js`; the hosted schema was already present, so only its migration-history record was reconciled. No hosted schema or workshop data was changed.

## What the migration creates

`migrations/20261118000000_initial_user_workshop.sql` creates one `user_workshop` row per authenticated Supabase user. The `data` column stores the current BenchPilot workshop as a JSON snapshot. `revision` supports the app's optimistic concurrency check when two devices may have changed the snapshot independently.

The app's current client reads and writes `data`, `revision`, and `updated_at`; the migration supplies all three. The client compares revisions and asks the user to choose a device or cloud copy when it detects a conflict. It does not merge individual fields or records.

## Access-control review

- `user_id` references `auth.users` and is the table's primary key, limiting each account to one snapshot.
- Row Level Security is enabled.
- Anonymous access is revoked; authenticated users receive only select, insert, and update grants.
- Each policy checks `auth.uid() = user_id` for the matching operation.
- Delete is not granted to clients. Deleting an Auth user cascades to that user's snapshot.
- The client configuration uses a publishable key. It must only be paired with these server-enforced RLS rules; no secret or service-role key belongs in the app.

## Compatibility and limits

- `schema.sql` is the original standalone bootstrap and currently matches this first migration. **Use one setup path, not both.** Keep it temporarily for compatibility; future changes should be added as new timestamped migrations.
- The snapshot approach avoids a large database rewrite while the app's data model is still evolving. It is appropriate for the current single-owner workshop sync, but it does not support partial record sync, collaborative editing, or automatic field-level conflict merges.
- Adding fields to the JSON snapshot usually needs an app-side state migration rather than a SQL table migration. Moving to normalized project, build, inventory, purchase, or attachment tables later will require an explicit data backfill from snapshots.
- `user_workshop_updated_at_idx` is currently retained to keep the migration aligned with the existing bootstrap. Since the table has at most one row per user and the app queries by `user_id`, this index is not needed for the current access pattern; it can be omitted from a future clean baseline if the bootstrap is retired.

## Applying and tracking migrations

The preferred long-term workflow is to use the Supabase CLI and apply timestamped files in order. The CLI records applied versions in `supabase_migrations.schema_migrations`. Applying SQL directly in the Dashboard SQL Editor does not update that history, so don't mix the two workflows without reconciling the migration ledger.

## Local validation performed

- Supabase CLI 3.2.0 initialized local CLI configuration without overwriting the existing migration.
- `supabase db reset --no-seed` applied `20261118000000_initial_user_workshop.sql` successfully to the local database.
- The local migration history lists `20261118000000` as applied.
- PostgreSQL catalog inspection confirms RLS is enabled and the expected select, insert, and update policies are present for `authenticated`.
- Table grants show no privileges for `anon`; `authenticated` has only select, insert, and update. The built-in `service_role` remains privileged by design and must never be used in client code.

## Hosted project inspection

- The hosted project already contained `public.user_workshop`; the migration history was empty.
- The existing table's columns, checks, foreign key, primary key, index, RLS state, policies, and effective client privileges matched the reviewed migration.
- Anonymous users cannot select the table. Authenticated users can select, insert, and update only as limited by the owner policies; client delete is not allowed.
- There is one workshop snapshot, with version 7, one project, three materials, and no builds. Snapshot contents were not read.
- Because the schema already matched, the SQL migration was **not replayed** against the hosted database. The CLI marked migration `20261118000000` as applied in the remote migration ledger. Post-change checks confirm the one row, RLS, and three policies remain present.

The owner confirmed the hosted app is signed in and reports cloud status `Synced` on both computer and phone. A first cross-device conflict was resolved by keeping the cloud copy on the computer; the app downloaded a backup first. The owner then confirmed both devices are synced. Offline replay and isolation between two signed-in accounts have not been tested.

## Remaining verification

1. The hosted Auth redirect allowlist includes the current BenchPilot Pages URL. The Auth configuration has not been changed.
2. Test offline edits, reconnect sync, and conflict prompts without overwriting the existing snapshot.
3. Use two test accounts to verify they cannot read or change each other's cloud row.
