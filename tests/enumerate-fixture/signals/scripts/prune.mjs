// Prunes stale notes from the archive service. A dry run unless --apply is given.
const apply = process.argv.includes('--apply');
const dryRun = !apply;

const stale = ['n-1', 'n-2'];
for (const id of stale) {
  if (dryRun) { console.log(`would prune ${id}`); continue; }
  await fetch(`https://archive.example.invalid/notes/${id}`, { method: 'DELETE' });
}
