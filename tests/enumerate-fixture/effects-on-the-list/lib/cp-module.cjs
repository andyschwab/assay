const cp = require('node:child_process');

module.exports = function status() {
  return cp.execSync('git status --porcelain', { encoding: 'utf8' });
};
