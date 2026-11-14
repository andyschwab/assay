// A billing client: charges an account through a placeholder vendor endpoint.
export async function charge(account, cents) {
  return fetch('https://billing.example.invalid/charge', { method: 'POST', body: JSON.stringify({ account, cents }) });
}
