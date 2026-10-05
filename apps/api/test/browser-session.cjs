// Exercises the browser proxy with mocked upstream responses, never a deployed API.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), Module = require('node:module'), path = require('node:path');
process.env.NODE_ENV = 'production';
const file = path.resolve(__dirname, '../../../packages/ui/src/api-proxy.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = new Module(file); mod.filename = file; mod.paths = module.paths; mod._compile(compiled, file);
const { proxy } = mod.exports;
const origin = 'https://xtra.example';
const ctx = route => ({ params: Promise.resolve({ path: route.split('/') }) });
const req = (route, method, body, headers = {}) => new Request(`${origin}/api/${route}`, { method, headers: { origin, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function main() {
  const fetchOriginal = global.fetch;
  try {
    let calls = 0, auth;
    global.fetch = async (url, options) => { calls++; auth = options.headers.get('authorization'); return Response.json({ user: { id: 'test' }, accessToken: 'private-access-test', refreshToken: 'private-refresh-test' }); };
    const bad = await proxy(req('auth/login', 'POST', {}, { origin: 'https://evil.example' }), ctx('auth/login'));
    assert.equal(bad.status, 403); assert.equal(calls, 0);
    const login = await proxy(req('auth/login', 'POST', {}), ctx('auth/login'));
    const body = await login.json(); assert.equal(body.accessToken, undefined); assert.equal(body.refreshToken, undefined);
    const cookies = login.headers.get('set-cookie'); assert(cookies.includes('__Host-xtra-access')); assert(cookies.includes('HttpOnly')); assert(cookies.includes('Secure')); assert(cookies.includes('SameSite=Lax'));
    global.fetch = async (url, options) => { auth = options.headers.get('authorization'); return Response.json({ id: 'test' }); };
    await proxy(req('me', 'GET', undefined, { cookie: '__Host-xtra-access=private-access-test' }), ctx('me'));
    assert.equal(auth, 'Bearer private-access-test');
    global.fetch = async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) return Response.json({ accessToken: 'rotated-access', refreshToken: 'rotated-refresh' });
      return options.headers.get('authorization') === 'Bearer rotated-access' ? Response.json({ id: 'test' }) : Response.json({}, { status: 401 });
    };
    const rotated = await proxy(req('me', 'GET', undefined, { cookie: '__Host-xtra-access=expired; __Host-xtra-refresh=previous-refresh' }), ctx('me'));
    assert.equal(rotated.status, 200); assert(rotated.headers.get('set-cookie').includes('rotated-access'));
    const logout = await proxy(req('auth/logout', 'POST', {}, { cookie: '__Host-xtra-refresh=rotated-refresh' }), ctx('auth/logout'));
    assert(logout.headers.get('set-cookie').includes('Max-Age=0'));
    console.log('PASS: same-origin CSRF enforcement, HttpOnly/Secure session cookies, no tokens in browser response, server-side Authorization, automatic refresh and logout cookie removal.');
  } finally { global.fetch = fetchOriginal; }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
