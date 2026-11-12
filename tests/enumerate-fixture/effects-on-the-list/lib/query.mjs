// reads only: no child_process here, so neither exec below is a subprocess
export function firstId(db, text) {
  const m = /id=(\d+)/.exec(text);
  db.exec('select 1');
  return m ? m[1] : null;
}
