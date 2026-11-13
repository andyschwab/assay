// ── a target's service declaration is closed (#256, map/services.mjs) ──
// `.assay/services.yaml` is read by the engine's strict YAML reader and checked key by key: an
// unknown key (top level or in a service), an image not pinned by a tag other than latest (or a
// digest), a bound step outside test and migrate, an env name the child allow-list owns, or a
// `${…}` naming anything but a declared service's host or port is refused, never guessed at.
// A refused declaration is recorded and converts to one `service-setup` gap; the steps run as
// if nothing were declared.
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseServices, imagePinned, SERVICES_FILE } from '../../map/services.mjs';
import { run as runFreshClone } from '../../map/fresh-clone.mjs';
import { projectMulti } from '../../map/project.mjs';
import { HERE, negFailures, convert, adaptersOnce } from '../harness.mjs';

export const label = 'services-declaration';

export async function run() {
  const fail = (m) => negFailures.push('services-declaration: ' + m);
  const fx = join(HERE, 'instruments', 'fresh-clone-services');
  const good = readFileSync(join(fx, SERVICES_FILE), 'utf8');
  let decl = null;
  try { decl = parseServices(good); } catch (e) { fail(`the fixture's declaration must read (got: ${e.message})`); }
  if (decl && (decl.services[0]?.image !== 'postgres:16.4-alpine' || decl.steps.join(',') !== 'test,migrate' || decl.setup.length !== 1 || !decl.env.DATABASE_URL)) fail(`the fixture's declaration reads as written (got ${JSON.stringify(decl)})`);
  const refused = (what, text, re) => {
    try { parseServices(text); fail(`${what} must be refused`); }
    catch (e) { if (!re.test(e.message)) fail(`${what}: the refusal must say why (got: ${e.message})`); }
  };
  refused('an unknown top-level key', good + 'volumes:\n  - /var/run\n', /unknown key "volumes" at the top level/);
  refused('an unknown key in a service', good.replace('    wait: 90\n', '    wait: 90\n    privileged: true\n'), /unknown key "privileged" in services\[0\]/);
  refused('an image tagged latest', good.replace('postgres:16.4-alpine', 'postgres:latest'), /pinned by a tag/);
  refused('an untagged image', good.replace('postgres:16.4-alpine', 'postgres'), /pinned by a tag/);
  refused('a bound step outside test and migrate', good.replace('steps: [test, migrate]', 'steps: [test, build]'), /steps: must list/);
  refused('an env name the allow-list owns', good.replace('  DATABASE_URL:', '  PATH: "/tmp"\n  DATABASE_URL:'), /"PATH" is set by the measurement's own allow-list/);
  refused('a reference to anything but a service host or port', good.replace('${postgres.port}', '${HOME}'), /names nothing/);
  refused('a missing ready check', good.replace('    ready: pg_isready -U postgres -h 127.0.0.1\n', ''), /ready must be/);
  if (!imagePinned('ghcr.io/x/y@sha256:' + 'a'.repeat(64)) || imagePinned('localhost:5000/pg')) fail('a digest pins an image; a registry port is not a tag');
  // a refused declaration: recorded, the steps run as if undeclared, one service-setup gap
  const scratch = mkdtempSync(join(tmpdir(), 'assay-services-refused-'));
  cpSync(fx, scratch, { recursive: true });
  writeFileSync(join(scratch, SERVICES_FILE), good + 'extra: 1\n');
  const doc = runFreshClone({ target: scratch, clone: false, timeout: 120, services: true, runtime: join(scratch, 'no-such-runtime') });
  rmSync(scratch, { recursive: true, force: true });
  if (!/unknown key "extra"/.test(doc.services?.refused || '')) fail(`a refused declaration is recorded with its reason (got ${JSON.stringify(doc.services)})`);
  const test = doc.steps.find((s) => s.name === 'test');
  if (test?.status !== 'failed' || test.services) fail(`with the declaration refused, the test runs as if undeclared (and fails without its database) (got ${test?.status})`);
  if (doc.exit !== 1) fail('a refused declaration makes the run exit 1');
  const rows = convert('fresh-clone', JSON.stringify(doc), 1);
  const gap = rows.find((r) => r.native_category === 'service-setup');
  if (!gap || gap.polarity !== 'gap' || gap.native_id !== 'service-setup:refused' || gap.evidence[0] !== `${SERVICES_FILE}:1` || !gap.fix) fail(`a refused declaration converts to one service-setup gap citing ${SERVICES_FILE}:1 (got ${JSON.stringify(gap)})`);
  const proj = projectMulti(rows, adaptersOnce());
  if (proj.unmapped.length) fail(`service-setup maps (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
}
