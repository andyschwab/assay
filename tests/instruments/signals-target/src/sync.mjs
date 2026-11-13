// the nightly sync: pulls the day's rows and records how many it touched
export async function sync(pull, record) {
  const rows = await pull();
  await record({ count: rows.length, at: new Date().toISOString() });
}
