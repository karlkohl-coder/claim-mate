import { CreditsView } from "@/components/CreditsView";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";

export default async function Page() {
  const locale = await getLocale();
  const dict = await getDictionary();
  return <CreditsView locale={locale} dict={dict.credits} />;
}
