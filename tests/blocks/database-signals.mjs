// ── database detection: Supabase, Drizzle, and a raw db/sql migrations folder ──
// A Supabase-shaped repo (a client dependency and a migrations folder, no ORM at
// all) must be recognized as carrying a database — d-schema-versioned must NEVER
// read met over it with no migrate step declared; a repo with no database signal
// anywhere reads not-applicable.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadYardstick, measureRun } from '../../yardstick/measure.mjs';
import { detectToolchain, run as runFreshClone } from '../../map/fresh-clone.mjs';
import { HERE, negFailures, convert } from '../harness.mjs';

export const label = 'database-signals';

export async function run() {
  const fail = (m) => negFailures.push('database-signals: ' + m);
  const tmp = join(HERE, 'tmp-db-signals'); rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'supabase', 'migrations'), { recursive: true });
  // the dependency is a local stand-in so the install never reaches a registry (#65)
  mkdirSync(join(tmp, 'vendor', 'supabase-js'), { recursive: true });
  writeFileSync(join(tmp, 'vendor', 'supabase-js', 'package.json'), JSON.stringify({ name: '@supabase/supabase-js', version: '2.0.0' }));
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'supabase-shaped', version: '0.0.0', private: true, dependencies: { '@supabase/supabase-js': 'file:vendor/supabase-js' } }));
  writeFileSync(join(tmp, 'supabase', 'migrations', '0001_init.sql'), 'create table t (id int);\n');
  writeFileSync(join(tmp, 'README.md'), '# supabase-shaped\n');
  let { toolchain } = detectToolchain(tmp);
  if (!toolchain.database_signals.includes('dep:@supabase/supabase-js')) fail(`a @supabase/supabase-js dependency must be a database signal (got ${JSON.stringify(toolchain.database_signals)})`);
  if (!toolchain.database_signals.includes('file:supabase/migrations')) fail(`a supabase/migrations directory must be a database signal (got ${JSON.stringify(toolchain.database_signals)})`);
  // end to end through the real runner: no migrate step declared -> d-schema-versioned
  // must read unmet or not-measured, NEVER met
  let doc = null;
  try { doc = runFreshClone({ target: tmp, clone: false, timeout: 30 }); } catch (e) { fail(`fresh-clone must run over the Supabase-shaped fixture (${e.message})`); }
  if (doc) {
    // the install must finish inside its budget: a timed-out install is SIGKILLed through its
    // shell and leaves npm orphaned, writing tests/tmp-db-signals/ back after the cleanup (#65)
    const install = doc.steps.find((s) => s.name === 'install');
    if (install?.status !== 'passed') fail(`the Supabase-shaped fixture's install must pass offline, never time out and orphan npm (got ${install?.status}: ${install?.reason || ''})`);
    const rows = convert('fresh-clone', JSON.stringify(doc), doc.exit);
    if (rows.some((r) => r.native_category === 'no-database-signal')) fail('a Supabase-shaped repo must never emit a no-database-signal fact — it has a database');
    const migrateGap = rows.find((r) => r.native_category === 'migrate');
    if (!migrateGap) fail('a Supabase-shaped repo with no migrate script must emit a migrate gap row (undeclared means unmet, not met)');
    const reg = loadYardstick();
    const schema = measureRun({ findings: rows, manifest: [{ scanner: 'fresh-clone', status: 'ran' }], inputs: null, coverage: {} }, reg).find((r) => r.id === 'd-schema-versioned');
    if (schema?.status === 'met') fail(`d-schema-versioned must NEVER read met over a Supabase-shaped repo with no migrate step (got ${schema?.status})`);
    if (schema?.status !== 'unmet') fail(`d-schema-versioned should read unmet over a Supabase-shaped repo with no migrate step (got ${schema?.status})`);
  }
  rmSync(tmp, { recursive: true, force: true });

  // a repo with no database signal at all: not-applicable, never met by silence
  const tmpNone = join(HERE, 'tmp-db-none'); rmSync(tmpNone, { recursive: true, force: true });
  mkdirSync(tmpNone, { recursive: true });
  writeFileSync(join(tmpNone, 'package.json'), JSON.stringify({ name: 'no-db', version: '0.0.0', private: true, scripts: { test: 'node -e "process.exit(0)"' } }));
  writeFileSync(join(tmpNone, 'README.md'), '# no-db\n');
  let doc2 = null;
  try { doc2 = runFreshClone({ target: tmpNone, clone: false, timeout: 30 }); } catch (e) { fail(`fresh-clone must run over the no-database fixture (${e.message})`); }
  if (doc2) {
    if (doc2.toolchain.database_signals.length) fail(`the no-database fixture must carry zero database signals (got ${JSON.stringify(doc2.toolchain.database_signals)})`);
    const rows2 = convert('fresh-clone', JSON.stringify(doc2), doc2.exit);
    const reg = loadYardstick();
    const schema2 = measureRun({ findings: rows2, manifest: [{ scanner: 'fresh-clone', status: 'ran' }], inputs: null, coverage: {} }, reg).find((r) => r.id === 'd-schema-versioned');
    if (schema2?.status !== 'not-applicable') fail(`d-schema-versioned must read not-applicable with no database signal anywhere (got ${schema2?.status})`);
  }
  rmSync(tmpNone, { recursive: true, force: true });
}
