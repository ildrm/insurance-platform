// Production uses an operator-configured public origin because TLS ends at
// ingress. Direct development listeners are HTTP. Forwarded headers supplied
// by a client never decide whether a cookie-authenticated write is trusted.
export function validWriteOrigin(headers: Headers, publicOrigin?: string): boolean {
  try {
    const host = headers.get('host');
    if (!host) return false;
    const expected = publicOrigin ? new URL(publicOrigin) : new URL('http://' + host);
    if (!['http:', 'https:'].includes(expected.protocol) || expected.username || expected.password || expected.pathname !== '/' || expected.search || expected.hash) return false;
    if (new URL(expected.protocol + '//' + host).host !== expected.host) return false;
    const origin = headers.get('origin');
    return origin ? origin === expected.origin : headers.get('sec-fetch-site') === 'same-origin';
  } catch { return false; }
}
