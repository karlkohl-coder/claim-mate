import { NextResponse, type NextRequest } from "next/server";
import { isLocale, pickLocale } from "@/i18n/config";

// Leitet Pfade ohne Sprache (z. B. "/") auf "/de/..." oder "/en/..." um.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1] ?? "";
  if (isLocale(firstSegment)) return;

  const locale = pickLocale(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Nicht für API-Routen, Next-Interna und Dateien mit Endung (favicon.ico usw.).
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
