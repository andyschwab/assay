// a pattern table: each line reads for a call (child_process spawnSync(, git push, docker run) and makes none
const TABLE = [
  [/\bspawnSync\(|\bgit\s+push\b|docker run/, 'git push'],
  [/\bexecSync\(/, 'shell'],
];
export function scan(line, hit) {
  if (/docker run|git push/.test(line)) hit('containers', 'docker run site');
  const m = line.match(/spawnSync\(/);
  return TABLE.length + (m ? 1 : 0);   // spawnSync( in a comment is no call either
}
