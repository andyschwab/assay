// child-env.mjs — the one environment a target's package manager or scripts ever
// see (#47). fresh-clone runs the target's own install and scripts; dependency-scan
// runs its package manager's audit. Neither child inherits the evaluator's
// environment: it is built from an allow-list — PATH and HOME (the package manager
// must be found and must find its cache), CI, and the npm_config_* values the
// calling instrument sets — and every other name (tokens, cloud keys, agent
// sockets, DATABASE_URL, proxies) is dropped. The contract is
// map/scanners/CONTRACT.md §3a ("What runs, and with what").

export const CHILD_ENV_NAMES = ['PATH', 'HOME', 'CI'];

/** @param {Record<string, string>} [set] the npm_config_* values the caller sets */
export function childEnv(set = {}) {
  const env = /** @type {Record<string, string>} */ ({});
  for (const name of CHILD_ENV_NAMES) if (process.env[name] !== undefined) env[name] = /** @type {string} */ (process.env[name]);
  env.CI = env.CI || '1';
  for (const [k, v] of Object.entries(set)) {
    if (!/^npm_config_\w+$/.test(k)) throw new Error(`childEnv: only npm_config_* names may be set (got ${k})`);
    env[k] = v;
  }
  return env;
}
