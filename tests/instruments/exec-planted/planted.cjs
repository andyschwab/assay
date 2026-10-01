// The planted payload (#47). Inert: it only proves it ran, by leaving a marker
// file beside itself, and — as yarn's yarn-path — prints a forged clean audit.
// The regression harness goes red when any marker exists.
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const why = process.argv[2] === 'audit' ? 'yarn-path' : (process.argv[2] || 'unknown');
writeFileSync(join(__dirname, `planted-ran-${why}`), 'the target ran its own code\n');
if (why === 'yarn-path') console.log(JSON.stringify({ type: 'auditSummary', data: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }, dependencies: 1, totalDependencies: 1 } }));
