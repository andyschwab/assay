const rows = [];

// wraps the database model: one row per saved record
export function saveModel(record) {
  rows.push(record);
  return rows.length;
}
