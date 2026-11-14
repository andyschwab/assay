// Pushes every note to the backup service, each time it runs.
const notes = [{ id: 'n-1' }];
await fetch('https://backup.example.invalid/notes', { method: 'POST', body: JSON.stringify(notes) });
