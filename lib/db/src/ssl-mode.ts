/**
 * node-postgres (pg 8) treats `sslmode=prefer`, `require` and `verify-ca` as
 * `verify-full`: TLS with the server certificate and host name checked. It
 * logs a SECURITY WARNING on every new process saying that pg 9 will give
 * those modes their weaker libpq meanings (`require`: encrypted, certificate
 * NOT checked; `prefer`: may fall back to no TLS at all).
 *
 * This states today's behaviour explicitly, so the connection stays
 * `verify-full` across that upgrade and the warning stops. Only the sslmode
 * value is rewritten; every other character of the connection string
 * (credentials, host, other parameters) is left exactly as given. A string
 * that opts into libpq semantics (`uselibpqcompat=true`), asks for no TLS
 * (`disable`), or has no sslmode at all (a local database, a Cloud SQL
 * socket) is returned unchanged.
 */
export function withExplicitSslMode(connectionString: string): string {
  const q = connectionString.indexOf("?");
  if (q === -1) return connectionString;
  const query = connectionString.slice(q + 1);
  if (/(?:^|&)uselibpqcompat=true(?:&|$)/i.test(query)) return connectionString;
  const rewritten = query.replace(/(^|&)sslmode=(?:prefer|require|verify-ca)(?=&|$)/gi, "$1sslmode=verify-full");
  return connectionString.slice(0, q + 1) + rewritten;
}
