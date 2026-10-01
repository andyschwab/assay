// child-env.mjs — the one environment a target's package manager or scripts ever
// see (#47). fresh-clone runs the target's own install and scripts; dependency-scan
// runs its package manager's audit. Neither child inherits the evaluator's
// environment: it is built from an allow-list — PATH and HOME (the package manager
// must be found and must find its cache), CI, and the npm_config_* values the
// calling instrument sets, plus the network plumbing below (#65) — and every other
// name (tokens, cloud keys, agent sockets, DATABASE_URL) is dropped. The contract is
// map/scanners/CONTRACT.md §3a ("What runs, and with what").

export const CHILD_ENV_NAMES = ['PATH', 'HOME', 'CI'];

// The network plumbing (#65): without it a package manager behind a proxy cannot
// reach its registry. Plumbing, not a credential, once a proxy URL carries no
// userinfo; a URL with user:pass@ is dropped, and proxyDropNote() says why.
const PLUMBING_NAMES = ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE'];
const PROXY_URL_NAMES = ['HTTPS_PROXY', 'HTTP_PROXY'];
// an '@' in the authority (scheme, if any, stripped) is userinfo; fail closed on any '@'
const hasUserinfo = (url) => String(url).replace(/^[a-z][\w+.-]*:\/\//i, '').split(/[/?#]/)[0].includes('@');
const droppedProxyNames = () => PROXY_URL_NAMES.filter((n) => process.env[n] !== undefined && hasUserinfo(process.env[n]));

/** the reason a proxy URL was kept from the child, for its row; null when none was */
export function proxyDropNote() {
  const dropped = droppedProxyNames();
  return dropped.length ? `${dropped.join(' and ')} not passed to the child: the proxy URL carries userinfo (user:pass@), a credential (#65)` : null;
}

/** @param {Record<string, string>} [set] the npm_config_* values the caller sets */
export function childEnv(set = {}) {
  const env = /** @type {Record<string, string>} */ ({});
  for (const name of CHILD_ENV_NAMES) if (process.env[name] !== undefined) env[name] = /** @type {string} */ (process.env[name]);
  const dropped = droppedProxyNames();
  for (const name of PLUMBING_NAMES) if (process.env[name] !== undefined && !dropped.includes(name)) env[name] = /** @type {string} */ (process.env[name]);
  env.CI = env.CI || '1';
  for (const [k, v] of Object.entries(set)) {
    if (!/^npm_config_\w+$/.test(k)) throw new Error(`childEnv: only npm_config_* names may be set (got ${k})`);
    env[k] = v;
  }
  return env;
}
