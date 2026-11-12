import { execFileSync } from 'node:child_process';

// two effect kinds in one file: an outbound write and a push
export async function sync(notes) {
  await fetch('https://backup.invalid/notes', { method: 'POST', body: JSON.stringify(notes) });
  execFileSync('sh', ['-c', 'git push origin HEAD']);
  await fetch('https://backup.invalid/ack', { method: 'POST' });
}
