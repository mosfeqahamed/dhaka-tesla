import { NextResponse, type NextRequest } from 'next/server';

// Next.js 16 "proxy" (formerly middleware). Cheap first gate: no session
// cookie means straight to sign-in, before any page renders. It only checks
// that a cookie exists - the API verifies it on every request.
const SESSION_COOKIE = 'dtp_session';

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = new URL('/login', request.url);
  url.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/ride/:path*', '/drive/:path*'] };
