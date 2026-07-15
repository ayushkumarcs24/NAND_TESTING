import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './en.json';
import hi from './hi.json';

export const LANGUAGE_KEY = '@nand_dairy_language';

const resources = {
  en: { translation: en },
  hi: { translation: hi },
};

/**
 * Initialize i18next with Hindi/English support.
 * Language is persisted to AsyncStorage and restored on next launch.
 */
export async function initI18n(): Promise<void> {
  const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
  const language = savedLanguage === 'hi' ? 'hi' : 'en';

  await i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React Native handles XSS
    },
    compatibilityJSON: 'v4',
  });
}

/**
 * Switch app language at runtime and persist the choice.
 */
export async function switchLanguage(lang: 'en' | 'hi'): Promise<void> {
  await i18n.changeLanguage(lang);
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
}

export default i18n;
