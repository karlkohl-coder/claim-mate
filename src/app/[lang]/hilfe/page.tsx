import { HelpView } from "@/components/HelpView";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { PROVIDER, PROVIDER_LABEL } from "@/lib/ai/config";

export default async function Page() {
  const locale = await getLocale();
  const dict = await getDictionary();
  return <HelpView locale={locale} dict={dict} ai={{ label: PROVIDER_LABEL[PROVIDER], local: PROVIDER === "ollama" }} />;
}
