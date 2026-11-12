// ── a mail or message send is an effect site (#272) ──
// A known-answer web app emails a summary through its own helper (`sendEmail`), which matched no
// effect pattern, so the effect triage never listed its outbound mail. A function named for
// sending mail or a message is now an effect site where it is defined or called, in any file
// (`message/mail send @ <file>`): sendEmail / sendMail / sendMessage / sendSms /
// sendNotification / sendWebhook, their snake_case forms, and notify… only where the name says the
// channel is outward (notifySlack, notifyByEmail). An in-process `notify` and a socket `send` are not
// listed, nor is a name that only contains one (resendEmailLater), nor a doc that names the
// helper (the pattern reads a name, so it reads code files only).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'enumerate-mail-sends';

const KIND = 'message/mail send';

export async function run() {
  const fail = (m) => negFailures.push('enumerate-mail-sends: ' + m);
  const fx = join(HERE, 'enumerate-fixture', 'effects');
  const doc = JSON.parse(execFileSync(process.execPath, [join(ROOT, 'map', 'enumerate.mjs'), fx, '--json'], { encoding: 'utf8' }));
  const sends = new Map(doc.populations.effectSites.filter((m) => m.member.startsWith(`${KIND} @ `)).map((m) => [m.member, m.evidence]));
  const want = {
    [`${KIND} @ lib/mailer.mjs`]: ['lib/mailer.mjs:2'],
    [`${KIND} @ lib/alerts.mjs`]: ['lib/alerts.mjs:5', 'lib/alerts.mjs:6', 'lib/alerts.mjs:8'],
    [`${KIND} @ lib/digest.py`]: ['lib/digest.py:5'],
  };
  for (const [member, evidence] of Object.entries(want)) {
    const got = sends.get(member);
    if (!got) { fail(`enumerate must list the mail send "${member}" (got ${[...sends.keys()].join(', ') || 'none'})`); continue; }
    if (JSON.stringify(got) !== JSON.stringify(evidence)) fail(`"${member}" must cite the send lines ${evidence.join(', ')} and no in-process notify or socket send (got ${got.join(', ')})`);
  }
  if (sends.has(`${KIND} @ docs/mail.md`)) fail('a doc that names the mail helper is not a send: the name pattern reads code files only');
  const extra = [...sends.keys()].filter((k) => !(k in want));
  if (extra.length) fail(`enumerate listed sends the fixture does not make: ${extra.join(', ')}`);
}
