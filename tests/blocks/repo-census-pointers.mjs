// ── repo-census reads the packet's pointers (owner/PACKET.md "Pointers") ─────
// tests/instruments/repo-census-pointers-target's packet/manifest.yaml is
// auto-picked-up (no --packet flag) and points every check at a non-default
// location; a decoy sits at each discovered default to prove no fallback.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'repo-census-pointers';
export const gate = [];   // not named on the gate's last line before the split (#87); named there once a reviewed change adds it

export async function run() {
  const fail = (m) => negFailures.push('repo-census-pointers: ' + m);
  const fx = join(HERE, 'instruments', 'repo-census-pointers-target');
  const tmp = join(HERE, 'tmp-repo-census-pointers'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const out = join(tmp, 'repo-census.json');
  // same real-git treatment as the repo-census fixture above: the commit-existence
  // gate needs a real history to pass the one transcript the packet's pointer reads.
  cpSync(fx, tmp, { recursive: true });
  const gitEnvPointers = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' };
  execFileSync('git', ['init', '-q'], { cwd: tmp, env: gitEnvPointers });
  execFileSync('git', ['add', '-A'], { cwd: tmp, env: gitEnvPointers });
  execFileSync('git', ['commit', '-q', '-m', 'fixture commit'], { cwd: tmp, env: gitEnvPointers });
  const pointersRealSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmp, encoding: 'utf8' }).trim();
  const nonstandardBackupPath = join(tmp, 'ops', 'nonstandard-evidence', 'd-backup-restore-exercised.md');
  writeFileSync(nonstandardBackupPath, readFileSync(nonstandardBackupPath, 'utf8').replace(/^commit: [0-9a-f]{7,40}$/m, `commit: ${pointersRealSha}`));
  let exit = 0;
  try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), tmp, '--out', out, '--as-of', '2026-09-28'], { stdio: 'pipe' }); }
  catch (e) { exit = e.status; }
  if (exit !== 1) fail(`the runner over the pointers fixture must exit 1 (planted gaps; got ${exit})`);
  let doc = null;
  try { doc = JSON.parse(readFileSync(out, 'utf8')); } catch { fail('the runner must write a JSON document at --out'); }
  if (doc) {
    if (!doc.packet || !doc.packet.auto || !/packet[/\\]manifest\.yaml$/.test(doc.packet.path)) fail(`no --packet flag: the run's own packet/manifest.yaml must be auto-picked-up and recorded (got ${JSON.stringify(doc.packet)})`);
    const wantPointers = ['agent_contract', 'apps', 'architecture', 'default_branch', 'evidence', 'runbook', 'workflows'];
    if (JSON.stringify(doc.packet.pointers_used) !== JSON.stringify(wantPointers)) fail(`pointers_used must list every pointer the run followed, sorted (got ${JSON.stringify(doc.packet.pointers_used)})`);
    if (doc.monorepo.locations.join() !== 'apps/web,apps/ghost') fail(`apps: must replace monorepo detection outright (got ${JSON.stringify(doc.monorepo)})`);
    const at = (nm, loc) => doc.checks.find((c) => c.name === nm && c.detail?.path === loc);

    // architecture: a list, positional against locations (root, then apps/web)
    const archRoot = at('architecture-page', '.');
    if (archRoot?.status !== 'pass' || archRoot.evidence[0] !== 'docs/nonstandard/ARCH.md:1' || !/per the packet's pointer/.test(archRoot.observation)) fail(`architecture pointer must be read at root, exactly, and say so (got ${JSON.stringify(archRoot)})`);
    const archWeb = at('architecture-page', 'apps/web');
    if (archWeb?.status !== 'pass' || archWeb.evidence[0] !== 'apps/web/ARCHITECTURE.md:1') fail(`a positional architecture pointer entry must be read for apps/web (got ${JSON.stringify(archWeb)})`);
    // apps/ghost: named by the apps pointer but does not exist -> a gap naming it, for BOTH per-location checks
    const archGhost = at('architecture-page', 'apps/ghost');
    if (archGhost?.status !== 'gap' || !/apps\/ghost as an app, which does not exist/.test(archGhost.observation)) fail(`a missing app path must gap for architecture-page, naming it (got ${JSON.stringify(archGhost)})`);
    const agentGhost = at('agent-contract', 'apps/ghost');
    if (agentGhost?.status !== 'gap' || !/apps\/ghost as an app, which does not exist/.test(agentGhost.observation)) fail(`a missing app path must gap for agent-contract, naming it (got ${JSON.stringify(agentGhost)})`);

    // agent_contract: a scalar, root only; apps/web falls back to ordinary discovery (absent there)
    const agentRoot = at('agent-contract', '.');
    if (agentRoot?.status !== 'pass' || agentRoot.evidence[0] !== 'OPERATOR.md:1') fail(`agent_contract pointer must be read at root, exactly (got ${JSON.stringify(agentRoot)})`);
    const agentWeb = at('agent-contract', 'apps/web');
    if (agentWeb?.status !== 'gap' || !/No AGENTS\.md or CLAUDE\.md found/.test(agentWeb.observation)) fail(`apps/web with no agent_contract pointer entry must fall back to ordinary discovery (got ${JSON.stringify(agentWeb)})`);

    // runbook: authoritative, no fallback to RUNBOOK.md discovery
    const rb = doc.checks.find((c) => c.name === 'runbook');
    if (rb?.status !== 'pass' || rb.evidence[0] !== 'docs/nonstandard/RUNBOOK-custom.md:1') fail(`runbook pointer must be read exactly (got ${JSON.stringify(rb)})`);

    // workflows: authoritative — the decoy at .github/workflows (fail-open) must be ignored entirely
    const ci = doc.checks.find((c) => c.name === 'ci-gate');
    if (ci?.status !== 'pass' || ci.evidence[0] !== '.github/ci-workflows/ci.yml:1') fail(`workflows pointer must be read exactly, ignoring the decoy at .github/workflows (got ${JSON.stringify(ci)})`);
    if (JSON.stringify(ci?.detail?.failOpen) !== '[]') fail('the decoy fail-open workflow at the default location must never be read once workflows: points elsewhere');

    // default_branch: the pointer beats discovery (no .git here, so discovery alone would read "main")
    if (ci?.detail?.defaultBranch !== 'trunk') fail(`default_branch pointer must beat discovery (got ${ci?.detail?.defaultBranch})`);

    // evidence: authoritative directory, no fallback to ops/evidence/ (which carries a decoy pass)
    const rollback = doc.checks.find((c) => c.name === 'evidence-d-rollback-exercised');
    if (rollback?.status !== 'gap' || !/packet points at ops\/nonstandard-evidence\/d-rollback-exercised\.md, which does not exist/.test(rollback.observation)) fail(`the evidence pointer must never fall back to ops\/evidence (got ${JSON.stringify(rollback)})`);
    const backup = doc.checks.find((c) => c.name === 'evidence-d-backup-restore-exercised');
    if (backup?.status !== 'pass' || backup.evidence[0] !== 'ops/nonstandard-evidence/d-backup-restore-exercised.md:1') fail(`the evidence pointer must be read exactly for the file that IS there (got ${JSON.stringify(backup)})`);
  }
  rmSync(tmp, { recursive: true, force: true });

  // --packet flag: an invalid packet halts the runner with the validator's own
  // lines, exit 2 (the crash rule) — never silently ignored, never a bare stack trace
  {
    let stderr = '', code = 0;
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), join(HERE, 'instruments', 'repo-census-target'), '--out', join(HERE, 'tmp-rc-invalid.json'), '--as-of', '2026-09-28', '--packet', join(HERE, 'negative', 'packet-secret-shaped')], { stdio: 'pipe' }); }
    catch (e) { code = e.status; stderr = String(e.stderr || ''); }
    if (code !== 2) fail(`an invalid --packet must halt the runner at exit 2 (got ${code})`);
    else if (!/looks like a secret value/.test(stderr)) fail(`an invalid --packet must report the validator's own lines (got: ${stderr.trim()})`);
    rmSync(join(HERE, 'tmp-rc-invalid.json'), { force: true });
  }

  // remote: git remote get-url origin, userinfo stripped; absent when there is no remote
  {
    const tmp2 = join(HERE, 'tmp-repo-census-remote'); rmSync(tmp2, { recursive: true, force: true }); mkdirSync(tmp2, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: tmp2 });
    execFileSync('git', ['remote', 'add', 'origin', 'https://x-access-token:not-a-real-token@example.test/example/notesbox.git'], { cwd: tmp2 });
    const out2 = join(tmp2, 'repo-census.json');
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), tmp2, '--out', out2, '--as-of', '2026-09-28'], { stdio: 'pipe' }); } catch { /* gaps expected (empty repo); only target.remote matters here */ }
    const doc2 = JSON.parse(readFileSync(out2, 'utf8'));
    if (doc2.target.remote !== 'https://example.test/example/notesbox.git') fail(`a remote's userinfo must be stripped (got ${doc2.target.remote})`);
    if (doc2.target.path !== tmp2) fail('target.path must still record the given target path (unchanged behavior)');
    rmSync(tmp2, { recursive: true, force: true });

    const tmp3 = join(HERE, 'tmp-repo-census-noremote'); rmSync(tmp3, { recursive: true, force: true }); mkdirSync(tmp3, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: tmp3 });
    const out3 = join(tmp3, 'repo-census.json');
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), tmp3, '--out', out3, '--as-of', '2026-09-28'], { stdio: 'pipe' }); } catch { /* gaps expected */ }
    const doc3 = JSON.parse(readFileSync(out3, 'utf8'));
    if ('remote' in doc3.target) fail(`target.remote must be absent with no remote configured (got ${JSON.stringify(doc3.target)})`);
    rmSync(tmp3, { recursive: true, force: true });
  }

  // --default-branch flag still beats a packet's default_branch pointer
  {
    const out4 = join(HERE, 'tmp-rc-branch-precedence.json');
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), fx, '--out', out4, '--as-of', '2026-09-28', '--default-branch', 'cli-wins'], { stdio: 'pipe' }); } catch { /* gaps expected */ }
    const doc4 = JSON.parse(readFileSync(out4, 'utf8'));
    const ciGate4 = doc4.checks.find((c) => c.name === 'ci-gate');
    if (ciGate4?.detail?.defaultBranch !== 'cli-wins') fail(`--default-branch must beat the packet's default_branch pointer (got ${ciGate4?.detail?.defaultBranch})`);
    rmSync(out4, { force: true });
  }
}
