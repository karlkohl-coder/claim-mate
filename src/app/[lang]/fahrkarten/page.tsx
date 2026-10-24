import { PassesView } from "@/components/PassesView";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";

export default async function Page() {
  const locale = await getLocale();
  const dict = await getDictionary();
  return <PassesView locale={locale} dict={dict.passes} demoLabel={dict.demo.addPass} />;
}
