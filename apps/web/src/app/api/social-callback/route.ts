import { NextRequest, NextResponse } from 'next/server';
// Apple's form_post response is forwarded as a fragment, never a logged query string.
export async function POST(request: NextRequest) {
  const data = await request.formData(), url = new URL('/auth/callback', request.url);
  const fields = new URLSearchParams();
  for (const key of ['state', 'code', 'error']) { const value = data.get(key); if (typeof value === 'string' && value.length <= 3000) fields.set(key, value); }
  url.hash = fields.toString(); return NextResponse.redirect(url, 303);
}
