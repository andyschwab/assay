# signals-orm — the enumerate fixture for #315 slice 3's ORM soft-delete reading

- `src/db/schema.ts`: two tables, `notes` with a `deletedAt` column and `feedback` with none.
- `src/routes/notes.ts`: a route that sets `notes.deletedAt` (a soft delete), one that sets a
  `deletedAt` on `feedback`, which the table does not declare (no signal), and a purge that
  deletes outright (no signal), and one that soft-deletes a note and hard-deletes beside it
  (no signal: the hard delete leaves nothing to undo).
- `src/routes/aliased.ts`: the same soft delete, the table imported through a path alias the
  tree defines once.
- `src/routes/members.ts`: a removal that keeps the row, once through `update(members).set({
  removedAt })` (the table declares `removedAt`) and once as literal SQL, `UPDATE … SET removed_at`.
- `prisma/schema.prisma` and `src/routes/v2.ts`: a client update whose data sets the model's
  `deletedAt`.

Nothing here runs; enumerate reads it.
