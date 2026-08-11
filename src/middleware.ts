import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const explicitLocale = request.cookies.get('USER_EXPLICIT_LOCALE')?.value;
  const pathname = request.nextUrl.pathname;

  // Enforce explicitly selected language globally (prevent back button from changing language)
  if (explicitLocale && ['tr', 'ar', 'en'].includes(explicitLocale)) {
    const urlLocaleMatch = pathname.match(/^\/(tr|ar|en)(\/|$)/);
    const urlLocale = urlLocaleMatch ? urlLocaleMatch[1] : null;

    if (urlLocale && urlLocale !== explicitLocale) {
      if (request.method === 'GET' && !pathname.startsWith('/api') && !pathname.includes('.')) {
        const newPathname = pathname.replace(`/${urlLocale}`, `/${explicitLocale}`);
        const url = request.nextUrl.clone();
        url.pathname = newPathname;
        return NextResponse.redirect(url);
      }
    }
  }

  const hasLocaleCookie = request.cookies.has('NEXT_LOCALE');
  
  if (!hasLocaleCookie && !explicitLocale) {
    const acceptLanguage = request.headers.get('Accept-Language') || '';
    const preferredLangMatch = acceptLanguage.match(/^[a-z]{2}/i);
    const preferredLang = preferredLangMatch ? preferredLangMatch[0].toLowerCase() : '';
    
    const supportedLocales = ['tr', 'ar', 'en'];
    
    if (preferredLang && !supportedLocales.includes(preferredLang)) {
      request.headers.set('Accept-Language', 'en');
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/', '/(tr|ar|en)/:path*']
};
