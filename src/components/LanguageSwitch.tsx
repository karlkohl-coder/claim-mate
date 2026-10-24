"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { locales, type Locale } from "@/i18n/config";

type Props = { current: Locale; label: string };

// Wechselt die Sprache und bleibt dabei auf derselben Seite (inkl. ?id=… bei Tickets). Gestaltet für den schwarzen Header.
export function LanguageSwitch({ current, label }: Props) {
  const pathname = usePathname() ?? `/${current}`;
  const router = useRouter();
  const rest = pathname.split("/").slice(2).join("/");

  return (
    <nav aria-label={label} className="flex rounded-full border border-white/25 p-0.5 text-sm">
      {locales.map((locale) => {
        const active = locale === current;
        const href = `/${locale}${rest ? `/${rest}` : ""}`;
        return (
          <Link
            key={locale}
            href={href}
            onClick={(e) => {
              e.preventDefault();
              router.push(href + window.location.search);
            }}
            aria-current={active ? "true" : undefined}
            hrefLang={locale}
            className={`rounded-full px-2.5 py-1.5 font-medium uppercase sm:px-3 transition-colors ${
              active ? "bg-white text-black" : "text-white/70 hover:text-white"
            }`}
          >
            {locale}
          </Link>
        );
      })}
    </nav>
  );
}
