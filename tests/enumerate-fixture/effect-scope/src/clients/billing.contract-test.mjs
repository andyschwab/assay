// A contract test for the billing client: replays the vendor's charge contract.
export async function replayCharge() {
  return fetch('https://billing.example.invalid/charge', { method: 'POST', body: '{"account":"a-1","cents":1}' });
}
