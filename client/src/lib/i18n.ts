import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Translation files
import enTranslations from '../locales/en.json';
import ptTranslations from '../locales/pt.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'pt'],
    // Map region locales to the base language — without this, a `pt-BR` browser
    // (every Brazilian user + Playwright's pt-BR locale) doesn't match the
    // supported `pt` and silently falls back to English. This is why the CBO
    // agent kept answering in English to Portuguese-speaking users.
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    debug: false,

    interpolation: {
      escapeValue: false, // React already escapes by default
    },

    resources: {
      en: {
        translation: enTranslations,
      },
      pt: {
        translation: ptTranslations,
      },
    },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      caches: ['localStorage'],
    },
  });

export default i18n;
