// a token table: bearer tokens hardcoded as a map's keys
const tokenTable = new Map([
  ['tok-dana', 'u1'],
  ['tok-sam', 'u2'],
]);

export const lookup = (token) => tokenTable.get(token);
