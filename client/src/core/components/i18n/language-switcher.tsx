import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/core/components/ui/select';
import { ChevronDown } from 'lucide-react';
import { analytics } from '@/core/lib/analytics';

const languages = [
  { code: 'en', name: 'EN', flag: '🇺🇸' },
  { code: 'pt', name: 'PT', flag: '🇧🇷' },
];

// `header` = white-on-transparent, for the dark shared layout header.
// `plain` = neutral foreground colors, for light surfaces like the
// orchestrator console header.
export function LanguageSwitcher({ variant = 'header' }: { variant?: 'header' | 'plain' } = {}) {
  const { i18n } = useTranslation();

  const handleLanguageChange = (languageCode: string) => {
    const currentLang = i18n.resolvedLanguage || 'en';
    analytics.preferences.languageChanged(currentLang, languageCode);
    i18n.changeLanguage(languageCode);
  };

  const currentLanguage =
    languages.find(lang => lang.code === i18n.resolvedLanguage) || languages[0];

  const triggerClass =
    variant === 'plain'
      ? 'w-auto min-w-[70px] h-8 rounded-full border-foreground/15 text-foreground hover:bg-foreground/5 transition-colors'
      : 'w-auto min-w-[70px] h-8 rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 transition-colors';

  return (
    <div data-testid='language-switcher'>
      <Select
        value={i18n.resolvedLanguage}
        onValueChange={handleLanguageChange}
      >
        <SelectTrigger
          className={triggerClass}
          data-testid='select-language'
        >
          <SelectValue>
            <span className='flex items-center gap-1.5'>
              <span className='text-sm'>{currentLanguage.flag}</span>
              <span className='text-sm font-medium'>
                {currentLanguage.name}
              </span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className='min-w-[120px]'>
          {languages.map(language => (
            <SelectItem key={language.code} value={language.code}>
              <span className='flex items-center gap-2'>
                <span>{language.flag}</span>
                <span className='font-medium'>{language.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
