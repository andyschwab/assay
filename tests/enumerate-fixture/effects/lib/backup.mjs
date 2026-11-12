// the same kind of call as lib/sync.mjs, in another file: its own member
export async function backup(blob) {
  return fetch('https://archive.invalid/put', { method: 'PUT', body: blob });
}
