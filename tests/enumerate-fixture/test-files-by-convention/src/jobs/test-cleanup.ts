// A scheduled job run on its own (no module imports it), whose name starts with "test-": it purges
// placeholder test accounts. No TypeScript runner reads a `test-` name.
export const purge = () => fetch('https://accounts.example.invalid/test-accounts', { method: 'DELETE' });
