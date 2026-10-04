// ── repo-census: a root document that names a workspace covers it (issue #27) ──
// A monorepo whose root architecture page and root agent contract name each
// workspace (by its path, or by its scoped package name) owes no page of its own
// per workspace: architecture-page and agent-contract read pass at every location,
// citing the root document's line that names it. Remove one workspace's mention
// from the root page and exactly that location gaps, for that check only. A root
// document that does not itself pass credits nothing, and a workspace's own file,
// when it has one, is still what is checked.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'repo-census-root-covers';

export async function run() {
  const fail = (m) => negFailures.push('repo-census-root-covers: ' + m);
  const tmp = join(HERE, 'tmp-repo-census-root-covers');
  const ARCH = [
    '# Architecture',
    '',
    'The API service reads and writes one Postgres database.',
    '',
    '- `apps/api` — the HTTP service, the only deployable.',
    '- `packages/lib` — shared validation code.',
    '- `@fx/ui` — the component library.',
    '',
  ].join('\n');
  const CONTRACT = [
    '# CLAUDE.md',
    '',
    'Run `npm test` before committing. Directory roles:',
    '',
    '- apps/api: the service.',
    '- packages/lib: shared code.',
    '- @fx/ui: components; never import from apps/api.',
    '',
  ].join('\n');
  const tree = ({ arch = ARCH, contract = CONTRACT } = {}) => {
    rmSync(tmp, { recursive: true, force: true });
    for (const d of ['docs', 'apps/api', 'packages/lib', 'packages/ui']) mkdirSync(join(tmp, d), { recursive: true });
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'fx', private: true, workspaces: ['apps/*', 'packages/*'] }) + '\n');
    writeFileSync(join(tmp, 'apps/api/package.json'), JSON.stringify({ name: 'api' }) + '\n');
    writeFileSync(join(tmp, 'packages/lib/package.json'), JSON.stringify({ name: 'lib' }) + '\n');
    writeFileSync(join(tmp, 'packages/ui/package.json'), JSON.stringify({ name: '@fx/ui' }) + '\n');
    writeFileSync(join(tmp, 'docs/architecture.md'), arch);
    writeFileSync(join(tmp, 'CLAUDE.md'), contract);
  };
  const census = () => {
    const out = join(tmp, '..', 'tmp-repo-census-root-covers.json');
    rmSync(out, { force: true });
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), tmp, '--out', out, '--default-branch', 'main', '--as-of', '2026-10-01'], { stdio: 'pipe' }); }
    catch { /* exit 1 is expected: ci-gate and runbook gap in this bare tree */ }
    const doc = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
    rmSync(out, { force: true });
    return doc;
  };
  const WS = ['apps/api', 'packages/lib', 'packages/ui'];
  const at = (doc, nm, loc) => doc.checks.find((c) => c.name === nm && c.detail?.path === loc);

  // (a) the root names every workspace: no per-workspace gap, each pass cites the naming line
  tree();
  let doc = census();
  if (!doc) { fail('the runner must write a document'); return; }
  if (doc.monorepo?.locations?.join() !== WS.join()) fail(`all three workspaces must be detected (got ${JSON.stringify(doc.monorepo)})`);
  const archLine = { 'apps/api': 5, 'packages/lib': 6, 'packages/ui': 7 };
  const contractLine = { 'apps/api': 5, 'packages/lib': 6, 'packages/ui': 7 };
  for (const loc of WS) {
    const a = at(doc, 'architecture-page', loc);
    if (a?.status !== 'pass' || a.evidence?.[0] !== `docs/architecture.md:${archLine[loc]}`) fail(`architecture-page@${loc} must pass, credited to docs/architecture.md:${archLine[loc]} (got ${a?.status}/${a?.evidence})`);
    const c = at(doc, 'agent-contract', loc);
    if (c?.status !== 'pass' || c.evidence?.[0] !== `CLAUDE.md:${contractLine[loc]}`) fail(`agent-contract@${loc} must pass, credited to CLAUDE.md:${contractLine[loc]} (got ${c?.status}/${c?.evidence})`);
  }
  const wsGaps = doc.checks.filter((c) => (c.name === 'architecture-page' || c.name === 'agent-contract') && c.status === 'gap');
  if (wsGaps.length) fail(`no architecture-page / agent-contract gap when the root covers the tree (got ${wsGaps.map((c) => `${c.name}@${c.detail.path}`).join(', ')})`);

  // (b) remove apps/api from the page: exactly one architecture gap, for apps/api
  tree({ arch: ARCH.replace('- `apps/api` — the HTTP service, the only deployable.\n', '') });
  doc = census();
  const archGaps = doc.checks.filter((c) => c.name === 'architecture-page' && c.status === 'gap').map((c) => c.detail.path);
  if (archGaps.join() !== 'apps/api') fail(`exactly one architecture-page gap, for apps/api, once the page stops naming it (got ${JSON.stringify(archGaps)})`);
  if (at(doc, 'agent-contract', 'apps/api')?.status !== 'pass') fail('agent-contract@apps/api still passes: the root contract still names it');

  // (c) a root contract that does not pass credits nothing
  tree({ contract: CONTRACT + '\n## Status\n\nStable.\n' });
  doc = census();
  const contractGaps = doc.checks.filter((c) => c.name === 'agent-contract' && c.status === 'gap').map((c) => c.detail.path);
  if (contractGaps.join() !== ['.', ...WS].join()) fail(`a root contract that gaps credits no workspace (got gaps at ${JSON.stringify(contractGaps)})`);

  // (d) a bare package name is never matched as a word ("lib" would match prose); a workspace's own file is still checked
  tree({ arch: ARCH.replace('`packages/lib`', '`lib`') });
  writeFileSync(join(tmp, 'apps/api/CLAUDE.md'), '# CLAUDE.md\n\n## Changelog\n\n- 2026-09-01 shipped\n');
  doc = census();
  if (at(doc, 'architecture-page', 'packages/lib')?.status !== 'gap') fail('a bare package name ("lib") must not credit packages/lib');
  const own = at(doc, 'agent-contract', 'apps/api');
  if (own?.status !== 'gap' || !own.evidence?.[0]?.startsWith('apps/api/CLAUDE.md')) fail(`a workspace's own contract is checked, not credited over (got ${own?.status}/${own?.evidence})`);

  rmSync(tmp, { recursive: true, force: true });
}
