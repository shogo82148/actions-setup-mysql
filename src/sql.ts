// quote returns s as a single-quoted SQL string literal.
// Single quotes are doubled rather than backslash-escaped, so the literal stays closed
// even when the server runs with the NO_BACKSLASH_ESCAPES SQL mode.
export function quote(s: string): string {
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

// account returns the account name 'user'@'host' with both parts quoted.
export function account(user: string, host: string): string {
  return `${quote(user)}@${quote(host)}`;
}
