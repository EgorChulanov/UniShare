import { create } from "zustand";
import iosEn from "../../../shared/src/i18n/ios.en.json";
import iosRu from "../../../shared/src/i18n/ios.ru.json";
import iosUk from "../../../shared/src/i18n/ios.uk.json";
import iosBe from "../../../shared/src/i18n/ios.be.json";
import { webStrings } from "./web-strings";
import { chatsStrings } from "./extra-chats";
import { profileStrings } from "./extra-profile";
import { searchStrings } from "./extra-search";
import { redesignStrings } from "./extra-redesign";
import { adminStrings } from "./extra-admin";
import { steamStrings } from "./extra-steam";
import { avatarStrings } from "./extra-avatar";

export type Language = "ru" | "en" | "uk" | "be";
export const LANGUAGES: { id: Language; name: string }[] = [
  { id: "ru", name: "Русский" },
  { id: "en", name: "English" },
  { id: "uk", name: "Українська" },
  { id: "be", name: "Беларуская" },
];

const dictionaries: Record<Language, Record<string, string>> = {
  ru: { ...iosRu, ...webStrings.ru, ...chatsStrings.ru, ...profileStrings.ru, ...searchStrings.ru, ...redesignStrings.ru, ...adminStrings.ru, ...steamStrings.ru, ...avatarStrings.ru },
  en: { ...iosEn, ...webStrings.en, ...chatsStrings.en, ...profileStrings.en, ...searchStrings.en, ...redesignStrings.en, ...adminStrings.en, ...steamStrings.en, ...avatarStrings.en },
  uk: { ...iosUk, ...webStrings.uk, ...chatsStrings.uk, ...profileStrings.uk, ...searchStrings.uk, ...redesignStrings.uk, ...adminStrings.uk, ...steamStrings.uk, ...avatarStrings.uk },
  be: { ...iosBe, ...webStrings.be, ...chatsStrings.be, ...profileStrings.be, ...searchStrings.be, ...redesignStrings.be, ...adminStrings.be, ...steamStrings.be, ...avatarStrings.be },
};

export function detectLanguage(code: string | null | undefined): Language {
  const value = (code ?? "").slice(0, 2).toLowerCase();
  if (value === "ru" || value === "en" || value === "uk" || value === "be") return value;
  return value ? "en" : "ru";
}

const STORAGE_KEY = "unishare.language";
function storedLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "ru" || value === "en" || value === "uk" || value === "be" ? value : null;
  } catch {
    return null;
  }
}

interface I18nState {
  language: Language;
  setLanguage(language: Language): void;
}

export const useI18n = create<I18nState>((set) => ({
  language: storedLanguage() ?? "ru",
  setLanguage(language) {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* ignored */
    }
    document.documentElement.lang = language;
    set({ language });
  },
}));

export function translate(language: Language, key: string, ...args: (string | number)[]): string {
  const template = dictionaries[language][key] ?? dictionaries.en[key] ?? dictionaries.ru[key] ?? key;
  return args.reduce<string>((text, arg, index) => text.replace(`{${index}}`, String(arg)), template);
}

/** Non-reactive translation for code outside components. */
export function t(key: string, ...args: (string | number)[]): string {
  return translate(useI18n.getState().language, key, ...args);
}

/** Re-renders the component when the language changes. */
export function useT() {
  const language = useI18n((state) => state.language);
  return (key: string, ...args: (string | number)[]) => translate(language, key, ...args);
}

export function hasLanguagePreference(): boolean {
  return storedLanguage() !== null;
}

export function errorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === "network") return t("error.network");
  if (code && dictionaries.en[`error.${code}`]) return t(`error.${code}`);
  const message = (error as Error)?.message;
  return message && message !== "network" ? message : t("error.generic");
}
