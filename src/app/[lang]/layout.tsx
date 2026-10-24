import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { HeaderActions } from "@/components/layout/HeaderActions";
import { TicketList } from "@/components/layout/TicketList";
import { locales } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import "../globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.meta.title, description: dict.meta.description };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  const dict = await getDictionary();

  return (
    <html lang={locale} className={`${dmSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-surface text-ink">
        <header className="sticky top-0 z-40 bg-black text-white">
          <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link href={`/${locale}`} className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <Image src="/logo.png" alt="" width={40} height={40} priority className="size-9 sm:size-10" />
              <span className="whitespace-nowrap text-lg font-bold tracking-tight sm:text-xl">{dict.header.appName}</span>
            </Link>
            <div className="flex items-center gap-2">
              <HeaderActions locale={locale} header={dict.header} tickets={dict.tickets} />
              <LanguageSwitch current={locale} label={dict.header.switchLanguage} />
            </div>
          </div>
        </header>

        <div className="grid w-full flex-1 grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="hidden border-r border-line lg:block">
            <div className="sticky top-[64px] flex max-h-[calc(100vh-64px)] flex-col gap-5 overflow-y-auto px-4 py-6">
              <TicketList locale={locale} dict={dict.tickets} />
              <Link href={`/${locale}/fahrkarten`} className="px-3 text-sm font-medium text-brand hover:underline">
                {dict.header.passes} →
              </Link>
            </div>
          </aside>
          <main className="min-w-0 px-4 py-8 sm:px-8 lg:py-12">
            <div className="mx-auto w-full max-w-4xl">{children}</div>
          </main>
        </div>

        <footer>
          <p className="mx-auto w-full max-w-3xl px-4 pb-6 pt-2 text-center text-xs leading-relaxed text-muted">{dict.footer.disclaimer}</p>
        </footer>
      </body>
    </html>
  );
}
