import { NextRequest } from 'next/server';
import { validWriteOrigin } from './origin';

// Keep tenant resolution and domain authorization at the trusted API boundary.
export async function proxy(request: NextRequest) {
  const method = request.method;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const sameOrigin = validWriteOrigin(request.headers, process.env.PORTAL_PUBLIC_ORIGIN);
    if (!sameOrigin) return Response.json({ code: 'INVALID_ORIGIN', message: 'This request must originate from this portal.', statusCode: 403 }, { status: 403, headers: { 'cache-control': 'private, no-store' } });
  }
  const headers = new Headers();
  // The API independently checks CSRF origins. Only forward an origin after the
  // portal has checked it against its operator-configured public URL and Host.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('origin', request.headers.get('origin') || process.env.PORTAL_PUBLIC_ORIGIN || 'http://' + request.headers.get('host'));
  }
  for (const name of ['cookie', 'authorization', 'content-type', 'idempotency-key', 'if-match', 'accept', 'x-request-id']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const maximum = 10 * 1024 * 1024;
  if (Number(request.headers.get('content-length')) > maximum) return Response.json({ code: 'PAYLOAD_TOO_LARGE', message: 'Maximum upload size is 10 MB.', statusCode: 413 }, { status: 413, headers: { 'cache-control': 'private, no-store' } });
  let bytes = 0;
  const body = !['GET', 'HEAD'].includes(method) && request.body ? request.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > maximum) throw new Error('PAYLOAD_TOO_LARGE');
      controller.enqueue(chunk);
    },
  })) : undefined;
  const origin = process.env.API_INTERNAL_ORIGIN || 'http://api:3000';
  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, origin);
  const deadline = AbortSignal.timeout(60_000);
  try {
    const init: RequestInit & { duplex?: 'half' } = { method, headers, body, cache: 'no-store', redirect: 'manual', signal: AbortSignal.any([request.signal, deadline]) };
    if (body) init.duplex = 'half';
    const upstream = await fetch(target, init);
    // API endpoints return JSON or attachments. Never redirect a cookie-bearing
    // browser request to an unexpected upstream Location.
    if (upstream.status >= 300 && upstream.status < 400 && upstream.status !== 304) {
      await upstream.body?.cancel();
      return Response.json({ code: 'UNEXPECTED_API_REDIRECT', message: 'The insurance service returned an unexpected redirect.', statusCode: 502 }, { status: 502, headers: { 'cache-control': 'private, no-store' } });
    }
    const responseHeaders = new Headers();
    for (const name of ['content-type', 'content-disposition', 'etag', 'x-request-id', 'retry-after']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    upstream.headers.getSetCookie().forEach(cookie => responseHeaders.append('set-cookie', cookie));
    responseHeaders.set('cache-control', 'private, no-store');
    responseHeaders.set('x-content-type-options', 'nosniff');
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    const tooLarge = bytes > maximum;
    const timedOut = deadline.aborted && !request.signal.aborted;
    const status = tooLarge ? 413 : timedOut ? 504 : 502;
    return Response.json({ code: tooLarge ? 'PAYLOAD_TOO_LARGE' : timedOut ? 'API_TIMEOUT' : 'API_UNAVAILABLE', message: tooLarge ? 'Maximum upload size is 10 MB.' : timedOut ? 'The insurance service took too long. Retry your request.' : 'The insurance service is unavailable. Please retry.', statusCode: status }, { status, headers: { 'cache-control': 'private, no-store' } });
  }
}
