import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en.json";
import ru from "@/locales/ru.json";

const CIS_LOCALES = ["ru", "uk", "be", "kk", "az", "hy", "ka", "uz", "tk", "tg", "ky", "mn"];

function detectLanguage(): string {
  return "en";
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
    },
    lng: detectLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

export function setLanguage(lang: string) {
  localStorage.setItem("oko-lang", lang);
  i18n.changeLanguage(lang);
}

export function isFirstVisit(): boolean {
  return !localStorage.getItem("oko-lang-chosen");
}

export function markLanguageChosen() {
  localStorage.setItem("oko-lang-chosen", "1");
}

export default i18n;
