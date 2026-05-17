import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PATHS = ['/dashboard'];
const AUTH_PATHS = ['/login'];
const PUBLIC_PATHS = ['/health'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => pathname.startsWith(p));
}

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((p) => pathname === p);
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function getSessionToken(req: NextRequest): string | null {
  const accessCookie = req.cookies.get('crux_access_token');
  if (accessCookie) return accessCookie.value;

  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = getSessionToken(request);

  // ── Root route: redirect to dashboard or login based on auth ──
  if (pathname === '/') {
    if (token) {
      return NextResponse.redirect(new URL('/dashboard/inbox', request.url));
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isProtectedPath(pathname) && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPath(pathname) && token) {
    const redirectPath = request.nextUrl.searchParams.get('redirect') || '/dashboard/inbox';
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  const response = NextResponse.next();

  if (token && isProtectedPath(pathname)) {
    response.headers.set('X-Auth-Valid', 'true');
  }

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/login',
    '/health/:path*',
    '/',
  ],
};