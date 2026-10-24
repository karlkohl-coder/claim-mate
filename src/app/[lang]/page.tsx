import Link from "next/link";
import { StartActions } from "@/components/StartActions";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";

function IconTile({ tone, children }: { tone: "brand" | "ok"; children: React.ReactNode }) {
  return (
    <span aria-hidden className={`grid size-14 place-items-center rounded-2xl text-white ${tone === "brand" ? "bg-brand" : "bg-ok"}`}>
      <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

export default async function HomePage() {
  const locale = await getLocale();
  const dict = await getDictionary();

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col items-center gap-3 text-center">
        <h1 className="display text-balance text-4xl sm:text-6xl">{dict.home.headline}</h1>
        <p className="max-w-xl text-pretty text-lg text-muted">{dict.home.subline}</p>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="flex flex-col gap-5 rounded-3xl border-2 border-brand-line bg-brand-tint p-7">
          <IconTile tone="brand">
            {/* Beleg mit Euro */}
            <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" />
            <path d="M14.5 9.5a2.5 2.5 0 1 0 0 3M10 10.5h4M10 12h3.5" />
          </IconTile>
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold tracking-tight">{dict.home.claimTitle}</h2>
            <p className="text-lg leading-relaxed text-muted">{dict.home.claimText}</p>
          </div>
          <div className="mt-auto">
            <StartActions locale={locale} labels={{ rail: dict.home.rail, air: dict.home.air }} />
          </div>
        </section>

        <section className="flex flex-col gap-5 rounded-3xl border-2 border-ok-line bg-ok-tint p-7">
          <IconTile tone="ok">
            {/* Zug */}
            <rect x="6" y="3" width="12" height="13" rx="3" />
            <path d="M6 10h12M9 13h.01M15 13h.01M9 16l-2 4M15 16l2 4" />
          </IconTile>
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold tracking-tight">{dict.home.helpTitle}</h2>
            <p className="text-lg leading-relaxed text-muted">{dict.home.helpText}</p>
          </div>
          <Link href={`/${locale}/hilfe`} className="group mt-auto flex items-center gap-2 text-lg font-medium text-ok">
            {dict.home.helpCta}
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        </section>
      </div>

      <p className="text-center text-sm leading-relaxed text-muted">
        {dict.home.passesHint}{" "}
        <Link href={`/${locale}/fahrkarten`} className="font-medium text-brand hover:underline">
          {dict.header.passes} →
        </Link>
      </p>
    </div>
  );
}
