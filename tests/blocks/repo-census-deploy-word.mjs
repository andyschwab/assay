// ── repo-census: a CI config deploys in what it runs, never in a comment (#165) ──
// The deploy-workflow signal used to fire on the word anywhere in the file, so a test-only
// workflow whose header comment said it deploys nothing counted as deployed and opened
// the six owner-evidence rows as gaps. Pinned, over a library with nothing else deployed:
//   (a) a GitHub workflow whose only "deploy" is in a comment (a YAML comment, or a
//       shell comment inside a run: block) records no signal, and the evidence rows read
//       not-applicable;
//   (b) a GitHub workflow deploys in a uses: action, a run: script (inline or its
//       block), a job or step name:, or an environment: key; the signal keeps its path
//       and cites the line it matched;
//   (c) any other CI config deploys in any line that is not a comment.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'repo-census-deploy-word';

const TEST_ONLY = `# One job: the test suite on every push and pull request. No build, no deploy.
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - run: npm test
`;

export async function run() {
  const fail = (m) => negFailures.push('repo-census-deploy-word: ' + m);
  const tmp = join(HERE, 'tmp-repo-census-deploy-word');
  const library = () => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(join(tmp, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'slug', version: '1.0.0', type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n');
    writeFileSync(join(tmp, 'index.mjs'), 'export const slug = (s) => s.toLowerCase();\n');
    writeFileSync(join(tmp, 'README.md'), '# slug\n\nA library.\n');
  };
  const census = () => {
    const out = join(tmp, '..', 'tmp-repo-census-deploy-word.json');
    rmSync(out, { force: true });
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), tmp, '--out', out, '--default-branch', 'main', '--as-of', '2026-10-01'], { stdio: 'pipe' }); }
    catch { /* exit 1 is a run with gaps */ }
    const doc = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
    rmSync(out, { force: true });
    return doc;
  };
  const deploys = (doc) => (doc?.deployment?.signals || []).filter((s) => s.kind === 'deploy-workflow');

  // (a) comments are not evidence
  const QUIET = [
    ['a header comment that says it does not deploy', '.github/workflows/ci.yml', TEST_ONLY],
    ['a shell comment inside a run: block', '.github/workflows/ci.yml', TEST_ONLY.replace('      - run: npm test\n', '      - run: |\n          # deploy happens elsewhere\n          npm test\n')],
    ['a trailing comment on a step', '.github/workflows/ci.yml', TEST_ONLY.replace('      - run: npm test\n', '      - run: npm test   # we never deploy from CI\n')],
    ['a word in an input description', '.github/workflows/ci.yml', TEST_ONLY.replace('on: [push, pull_request]\n', 'on:\n  workflow_dispatch:\n    inputs:\n      note:\n        description: "this workflow does not deploy"\n')],
    ['a comment in a GitLab config', '.gitlab-ci.yml', '# deploy is done by hand\ntest:\n  script:\n    - npm test\n'],
  ];
  for (const [what, path, text] of QUIET) {
    library(); mkdirSync(join(tmp, path, '..'), { recursive: true }); writeFileSync(join(tmp, path), text);
    const doc = census();
    if (!doc) { fail(`${what}: the runner must write a document`); continue; }
    if (deploys(doc).length) fail(`${what}: no deploy-workflow signal (got ${JSON.stringify(deploys(doc))})`);
    const c = doc.checks.find((x) => x.name === 'evidence-d-rollback-exercised');
    if (c?.status !== 'not-applicable') fail(`${what}: with nothing deployed the evidence rows read not-applicable (got ${c?.status})`);
  }

  // (b) and (c): what runs is evidence, and the signal cites the line
  const LOUD = [
    ['a deploy action', '.github/workflows/ci.yml', TEST_ONLY.replace('      - run: npm test\n', '      - run: npm test\n      - uses: actions/deploy-pages@v4\n'), 10],
    ['an inline run: script', '.github/workflows/ci.yml', TEST_ONLY.replace('      - run: npm test\n', '      - run: ./scripts/deploy.sh\n'), 9],
    ['a run: block script', '.github/workflows/ci.yml', TEST_ONLY.replace('      - run: npm test\n', '      - run: |\n          npm test\n          npx wrangler deploy\n'), 11],
    ['a step name', '.github/workflows/ci.yml', TEST_ONLY.replace('      - run: npm test\n', '      - name: Deploy to staging\n        run: ./ship.sh\n'), 9],
    ['an environment key', '.github/workflows/ci.yml', TEST_ONLY.replace('    runs-on: ubuntu-latest\n', '    runs-on: ubuntu-latest\n    environment: deploy-prod\n'), 7],
    ['a GitLab deploy stage', '.gitlab-ci.yml', '# deploy is done by hand\nrelease:\n  stage: deploy\n  script:\n    - ./release.sh\n', 3],
  ];
  for (const [what, path, text, line] of LOUD) {
    library(); mkdirSync(join(tmp, path, '..'), { recursive: true }); writeFileSync(join(tmp, path), text);
    const doc = census();
    if (!doc) { fail(`${what}: the runner must write a document`); continue; }
    const s = deploys(doc);
    if (s.length !== 1 || s[0].path !== path || s[0].line !== line) fail(`${what}: one deploy-workflow signal at ${path} line ${line} (got ${JSON.stringify(s)})`);
    if (s[0] && !new RegExp(`line ${line}`).test(s[0].what || '')) fail(`${what}: the signal's description cites the line it matched (got ${s[0].what})`);
    const c = doc.checks.find((x) => x.name === 'evidence-d-rollback-exercised');
    if (c?.status !== 'gap') fail(`${what}: a deploying tree keeps the evidence rows measured (got ${c?.status})`);
  }
  rmSync(tmp, { recursive: true, force: true });
}
