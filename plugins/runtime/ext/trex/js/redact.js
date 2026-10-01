// Redact secrets from a string before logging. SQL we log can embed
// connection strings - e.g. `ATTACH '... password=mypass' (TYPE postgres)`
// or `hdbsql://user:pass@host` - and those must never reach stdout in
// cleartext. Mirrors the key list used by the Rust SwarmLogger::sanitize.
const SECRET_KEYS = ['password', 'passwd', 'secret', 'token', 'credential', 'authorization'];
export function redactSecrets(text) {
	if (typeof text !== 'string') return text;
	let out = text;
	// key=value / key:value, optional quotes around the value; stop at the
	// first whitespace/quote/delimiter so we don't over-redact the rest.
	for (const key of SECRET_KEYS) {
		const re = new RegExp(`(${key}\\s*[=:]\\s*)('[^']*'|"[^"]*"|[^\\s'",;)]+)`, 'gi');
		out = out.replace(re, '$1[REDACTED]');
	}
	// Key material inside CREATE SECRET literals ('' escapes included); mirrors
	// core/server/d2e-compat/lib/attach.ts redactSecrets.
	out = out.replace(/(PRIVATE_KEY(?:_PASSPHRASE)?\s+)'(?:[^']|'')*'/gi, "$1'[REDACTED]'");
	out = out.replace(/(SERVICE_ACCOUNT_JSON\s+)'(?:[^']|'')*'/gi, "$1'[REDACTED]'");
	// URI userinfo: scheme://user:secret@host  ->  scheme://user:[REDACTED]@host
	out = out.replace(/([a-z][a-z0-9+.-]*:\/\/[^:/?#\s]+:)([^@\s]+)(@)/gi, '$1[REDACTED]$3');
	return out;
}
