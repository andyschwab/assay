// A runtime adapter whose name starts with "test-": it writes media to a placeholder bucket.
export async function uploadMedia(name: string): Promise<Response> {
  return fetch(`https://media.example.invalid/bucket/${name}`, { method: 'PUT' });
}
