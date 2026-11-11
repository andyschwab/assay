// census.mjs — a census population's members, and the count they decide (#260; map/SCHEMA.md §6b).
//
// A `sampled:` entry in map/censuses.yaml lists its population in `members:`, the finding ids
// that are its members, one per member. The count is read off them, never typed by hand:
//   • a `strength` member meets the census's bar, and counts in met and of;
//   • a `gap` member does not, and counts in of only;
//   • a `fact` member records what is and carries no verdict against the bar, so it counts in
//     of and never in met: a census with one cannot read met (the measurement names it), the
//     way an untriaged candidate holds an effect row back (map/effect-triage.mjs);
//   • an id this run does not carry is a member with no verdict too (validate refuses it).
// An entry with no `members:` keeps its authored met/of, and the yardstick never reads it met:
// an authored count is not evidence (yardstick/README.md, "Met needs positive evidence").
// The one reader of the field: validate (memberErrors), the measurement and the maturity view
// (censusCount) all read it here, so the three cannot count a population two ways.

const isId = (x) => typeof x === 'string' && x.length > 0;

// { listed, members, strengths, gaps, unjudged, met, of }: listed is false for an entry with no
// members: list, whose met/of are the authored numbers. findingsById: id → finding.
export function censusCount(s, findingsById = new Map()) {
  if (!s || !Array.isArray(s.members)) return { listed: false, members: [], strengths: [], gaps: [], unjudged: [], met: Number(s && s.met), of: Number(s && s.of) };
  const members = [...new Set(s.members.map(String))];
  const pol = (id) => { const f = findingsById.get(id); return f && f.polarity; };
  const strengths = members.filter((id) => pol(id) === 'strength');
  const gaps = members.filter((id) => pol(id) === 'gap');
  const unjudged = members.filter((id) => !strengths.includes(id) && !gaps.includes(id));
  return { listed: true, members, strengths, gaps, unjudged, met: strengths.length, of: members.length };
}

// validate's check of one sampled entry's members against the run. at: the entry's label.
export function memberErrors(s, findingsById, at) {
  const errors = [];
  if (s.members === undefined) return errors;
  if (!Array.isArray(s.members) || !s.members.length) return [`${at}: members must be a non-empty list of the finding ids that are the census's members, one per member`];
  const seen = new Set();
  for (const id of s.members) {
    if (!isId(id)) { errors.push(`${at}: members: ${JSON.stringify(id)} is not a finding id`); continue; }
    if (seen.has(id)) errors.push(`${at}: members: ${id} is listed twice (one id per member)`);
    seen.add(id);
    if (!findingsById.has(id)) errors.push(`${at}: members: ${id} is not a finding in this run`);
  }
  const c = censusCount(s, findingsById);
  for (const k of ['met', 'of']) if (s[k] !== undefined && s[k] !== c[k])
    errors.push(`${at}: authored ${k}: ${s[k]} disagrees with members: (${c.met} strength of ${c.of} members) — the count is read off the members; drop the authored ${k} or correct it`);
  return errors;
}
