import { buildLanguageOptions, type Locale, type Translations } from "@/lib/i18n";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  t: Translations;
  className: string;
};

export function LanguageSelect({ id, value, onChange, locale, t, className }: Props) {
  const { autoDetect, featured, others } = buildLanguageOptions(locale, t);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value={autoDetect.value}>{autoDetect.label}</option>
      {featured.map((lang) => (
        <option key={lang.value} value={lang.value}>
          {lang.label}
        </option>
      ))}
      <option disabled>────────────────</option>
      {others.map((lang) => (
        <option key={lang.value} value={lang.value}>
          {lang.label}
        </option>
      ))}
    </select>
  );
}
