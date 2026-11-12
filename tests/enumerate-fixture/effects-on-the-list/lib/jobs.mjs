import { spawnSync, execFile } from 'node:child_process';

export function audit(dir) {
  return spawnSync('npm', ['audit', '--json'], { cwd: dir, shell: true });
}

export function version(cb) {
  execFile('git', ['--version'], cb);
}
