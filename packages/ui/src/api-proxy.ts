/**
 * Server-side proxy used by the web and admin apps at /api/*. The browser only ever talks to its own
 * origin, so there is no CORS to configure, and the API address is read at runtime (API_URL), so
 * changing it needs a restart rather than a rebuild.
 */
const HOP_HEADERS = ['authorization', 'content-type', 'accept', 'x-forwarded-for', 'user-agent'];
const PASS_BACK = ['content-type', 'content-disposition', 'cache-control'];

export function apiBaseUrl(): string {
  return (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
}

async function proxy(req: Request, ctx: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const { path = [] } = await ctx.params;
  const target = `${apiBaseUrl()}/${path.map(encodeURIComponent).join('/')}${new URL(req.url).search}`;

  const headers = new Headers();
  for (const h of HOP_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
      // Free-tier APIs can take ~1 minute to wake up.
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e) {
    console.error(`API proxy: cannot reach ${target}`, e);
    return Response.json(
      { statusCode: 502, message: `The XTRA-CASH API at ${apiBaseUrl()} is not responding. Check API_URL on this site and that the API service is running.` },
      { status: 502 },
    );
  }

  const out = new Headers();
  for (const h of PASS_BACK) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
