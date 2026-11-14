// The runtime entry: it imports the media adapter and the seed defaults, so both run in production.
import { uploadMedia } from './adapters/test-media';
import { seedDefaults } from './fixtures/seed.js';

export async function main(): Promise<void> {
  await seedDefaults();
  await uploadMedia('cover.png');
  await fetch('https://status.example.invalid/ready', { method: 'POST' });
}
