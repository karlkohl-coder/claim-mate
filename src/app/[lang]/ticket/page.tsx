import { Suspense } from "react";
import { TicketView } from "@/components/ticket/TicketView";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { PROVIDER, PROVIDER_LABEL } from "@/lib/ai/config";

export default async function TicketPage() {
  const locale = await getLocale();
  const dict = await getDictionary();
  return (
    <Suspense>
      <TicketView locale={locale} dict={dict} ai={{ label: PROVIDER_LABEL[PROVIDER], local: PROVIDER === "ollama" }} />
    </Suspense>
  );
}
