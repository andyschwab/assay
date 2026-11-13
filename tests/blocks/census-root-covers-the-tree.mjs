// ── census-root-covers-the-tree: a root's documents cover the workspaces with none of their own (#306) ──
// A run read d-architecture-page and d-agent-contract unmet for two workspaces whose root
// carries a passing architecture page and agent contract: the census credited a workspace only
// when the root's document named it. A root's page and contract cover every workspace that has
// none of its own, unless the workspace is a separately deployed unit: one that ships a deploy
// artifact of its own (a container file, a hosting config, an infrastructure or service
// manifest; the census's own deployment signals). Pinned:
//   (a) the false positive: unnamed workspaces with no documents and nothing deployed apart read
//       pass, citing the root's document, and both rows read met;
//   (b) the true positive: a workspace with its own container file and no documents still gaps,
//       citing itself, and neither row reads met; a root that fails covers nothing;
//   (c) a workspace's own document is still what is checked.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { run as census } from '../../map/repo-census.mjs';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { negFailures, convert } from '../harness.mjs';

export const label = 'census-root-covers-the-tree';

export async function run() {
  const fail = (m) => negFailures.push('census-root-covers-the-tree: ' + m);
  const scratch = mkdtempSync(join(tmpdir(), 'assay-root-covers-'));
  const reg = loadYardstick();
  const ROOT_FILES = {
    'package.json': JSON.stringify({ name: 'mono', private: true, workspaces: ['apps/*', 'packages/*'] }) + '\n',
    'ARCHITECTURE.md': '# Architecture\n\nOne web app over a Postgres database; the ui package is its components.\n',
    'CLAUDE.md': '# CLAUDE.md\n\nRun `npm test` before committing.\n',
    'apps/web/package.json': JSON.stringify({ name: 'web', private: true }) + '\n',
    'packages/ui/package.json': JSON.stringify({ name: 'ui', private: true }) + '\n',
  };
  const tree = (name, extra = {}) => {
    const dir = join(scratch, name);
    for (const [f, body] of Object.entries({ ...ROOT_FILES, ...extra })) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), body); }
    const doc = census({ target: dir, defaultBranch: 'main', asOf: '2026-11-13' });
    const rows = convert('repo-census', JSON.stringify(doc), doc.exit);
    const measured = measureRun({ findings: rows, manifest: [{ scanner: 'repo-census', status: 'ran' }], inputs: null, coverage: {} }, reg);
    return { at: (nm, loc) => doc.checks.find((c) => c.name === nm && c.detail?.path === loc), row: (id) => measured.find((r) => r.id === id) };
  };
  const ROWS = { 'architecture-page': ['d-architecture-page', 'ARCHITECTURE.md:1'], 'agent-contract': ['d-agent-contract', 'CLAUDE.md:1'] };
  try {
    // (a) the false positive
    const covered = tree('covered');
    for (const [check, [id, cite]] of Object.entries(ROWS)) {
      for (const loc of ['apps/web', 'packages/ui']) {
        const c = covered.at(check, loc);
        if (c?.status !== 'pass' || c.evidence?.[0] !== cite || c.detail?.cover !== 'tree') fail(`(a) ${check}@${loc} has none of its own and is deployed with the root: it passes by the root's cover, citing ${cite} (got ${c?.status} ${JSON.stringify(c?.evidence)}: ${c?.observation})`);
      }
      const r = covered.row(id);
      if (r?.status !== 'met') fail(`(a) ${id} reads met by the root's cover (got ${r?.status})`);
    }

    // (b) the true positive: a separately deployed workspace with no documents of its own
    const apart = tree('deployed-apart', { 'apps/worker/package.json': JSON.stringify({ name: 'worker', private: true }) + '\n', 'apps/worker/Dockerfile': 'FROM node:22-alpine\nCMD ["node", "worker.js"]\n' });
    for (const [check, [id]] of Object.entries(ROWS)) {
      const w = apart.at(check, 'apps/worker');
      if (w?.status !== 'gap' || w.evidence?.[0] !== 'apps/worker/:1') fail(`(b) ${check}@apps/worker ships its own container and has no document: it gaps, citing itself (got ${w?.status} ${JSON.stringify(w?.evidence)})`);
      if (apart.at(check, 'apps/web')?.status !== 'pass') fail(`(b) ${check}@apps/web is still covered beside a workspace deployed apart`);
      const r = apart.row(id);
      if (!['unmet', 'mixed'].includes(r?.status)) fail(`(b) ${id} is never met while a separately deployed workspace has no document: unmet, or mixed beside the covered ones (got ${r?.status})`);
    }
    const failing = tree('root-fails', { 'CLAUDE.md': '# CLAUDE.md\n\n## Changelog\n\n- 2026-09-01 shipped\n' });
    if (failing.at('agent-contract', 'apps/web')?.status !== 'gap') fail('(b) a root contract that does not pass covers nothing');

    // (c) a workspace's own document is checked, never covered over
    const own = tree('own', { 'packages/ui/CLAUDE.md': '# CLAUDE.md\n\n## Status\n\nIn progress.\n' });
    const ui = own.at('agent-contract', 'packages/ui');
    if (ui?.status !== 'gap' || !String(ui.evidence?.[0]).startsWith('packages/ui/CLAUDE.md')) fail(`(c) a workspace's own contract is what is checked (got ${ui?.status} ${JSON.stringify(ui?.evidence)})`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
