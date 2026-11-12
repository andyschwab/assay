import { sh } from './shell.mjs';   // a helper this fixture does not ship: no child_process here (#298)

// two effect kinds in one file: an outbound write and a push
export async function sync(notes) {
  await fetch('https://backup.invalid/notes', { method: 'POST', body: JSON.stringify(notes) });
  await sh('git push origin HEAD');
  await fetch('https://backup.invalid/ack', { method: 'POST' });
}
