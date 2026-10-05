export function formatAmount(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatLegacy(cents) {
  return `USD ${cents}`;
}
