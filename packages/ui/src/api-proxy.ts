/** Same-origin backend-for-frontend. Tokens never reach browser JavaScript. */
export function apiBaseUrl(): string {
  return (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
}
const sessions = new Map<string, Promise<{ accessToken: string; refreshToken: string } | null>>();
const name = (kind: string) => `${process.env.NODE_ENV === 'production' ? '__Host-' : ''}xtra-${kind}`;
function cookie(req: Request, kind: string) {
  return req.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(name(kind) + '='))?.slice(name(kind).length + 1);
}
function setSession(headers: Headers, tokens: { accessToken: string; refreshToken: string } | null) {
  for (const [kind, value] of [['access', tokens?.accessToken], ['refresh', tokens?.refreshToken]]) {
    headers.append('set-cookie', `${name(kind!)}=${value || ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value ? 2592000 : 0}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  }
}
async function refresh(token: string) {
  let work = sessions.get(token);
  if (!work) {
    work = fetch(`${apiBaseUrl()}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: token }), cache: 'no-store', signal: AbortSignal.timeout(15000) })
      .then(async r => r.ok ? r.json() : null).catch(() => null);
    sessions.set(token, work!);
    setTimeout(() => sessions.delete(token), 10000);
  }
  return work;
}
export async function proxy(req: Request, ctx: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const { path = [] } = await ctx.params;
  const route = '/' + path.join('/');
  const url = new URL(req.url);
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  if (hasBody && (req.headers.get('origin') !== url.origin || req.headers.get('sec-fetch-site') === 'cross-site')) {
    return Response.json({ message: 'Please use XTRA-CASH in its own browser tab.' }, { status: 403 });
  }
  const target = `${apiBaseUrl()}/${path.map(encodeURIComponent).join('/')}${url.search}`;
  const headers = new Headers();
  for (const key of ['content-type', 'accept', 'x-forwarded-for', 'user-agent']) {
    const v = req.headers.get(key); if (v) headers.set(key, v);
  }
  const access = cookie(req, 'access'), refreshToken = cookie(req, 'refresh');
  if (access) headers.set('authorization', `Bearer ${access}`);
  let body: BodyInit | undefined = hasBody ? await req.arrayBuffer() : undefined;
  if (route === '/auth/logout') {
    if (!refreshToken) { const out = new Headers(); setSession(out, null); return Response.json({ ok: true }, { headers: out }); }
    headers.set('content-type', 'application/json'); body = JSON.stringify({ refreshToken });
  }
  if (route === '/auth/refresh') return Response.json({ message: 'Sessions refresh automatically' }, { status: 400 });
  const send = () => fetch(target, { method: req.method, headers, body, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(90000) });
  try {
    let res = await send();
    const out = new Headers({ 'cache-control': 'no-store' });
    const protectedRoute = !route.startsWith('/auth/') || route.startsWith('/auth/sessions') || route.startsWith('/auth/passkeys/register') || route === '/auth/passkeys' || route.startsWith('/auth/passwordless/profile');
    if (res.status === 401 && refreshToken && protectedRoute) {
      const tokens = await refresh(refreshToken);
      if (tokens) { headers.set('authorization', `Bearer ${tokens.accessToken}`); res = await send(); setSession(out, tokens); }
      else setSession(out, null);
    }
    for (const h of ['content-type', 'content-disposition']) { const v = res.headers.get(h); if (v) out.set(h, v); }
    if (route === '/auth/logout') setSession(out, null);
    if (route.startsWith('/auth/') && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data?.accessToken && data?.refreshToken) {
        setSession(out, data); delete data.accessToken; delete data.refreshToken;
      }
      return Response.json(data, { status: res.status, headers: out });
    }
    return new Response(res.body, { status: res.status, headers: out });
  } catch {
    return Response.json({ message: 'We could not reach XTRA-CASH. Please try again shortly.' }, { status: 502 });
  }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
