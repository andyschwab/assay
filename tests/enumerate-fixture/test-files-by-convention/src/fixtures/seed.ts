// Seed defaults under a fixtures/ directory, imported by src/index.ts: it runs at run time.
export async function seedDefaults(): Promise<Response> {
  return fetch('https://seed.example.invalid/defaults', { method: 'POST' });
}
