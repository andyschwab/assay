export async function ask(prompt, key) {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key }, body: JSON.stringify({ prompt }) });
  return r.json();
}
