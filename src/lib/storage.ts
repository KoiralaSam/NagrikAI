import AsyncStorage from "@react-native-async-storage/async-storage";
import { LanguageCode } from "../types/agent";

const DEVICE_KEY = "nagrikai.deviceId";
const API_KEY = "nagrikai.apiUrl";
const LANG_KEY = "nagrikai.language";

function createId() {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) {
    return random;
  }

  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getDeviceId() {
  const existing = await AsyncStorage.getItem(DEVICE_KEY);
  if (existing) {
    return existing;
  }

  const next = createId();
  await AsyncStorage.setItem(DEVICE_KEY, next);
  return next;
}

export async function getStoredApiUrl() {
  return AsyncStorage.getItem(API_KEY);
}

export async function setStoredApiUrl(value: string) {
  await AsyncStorage.setItem(API_KEY, value);
}

export async function getStoredLanguage(): Promise<LanguageCode | null> {
  const value = await AsyncStorage.getItem(LANG_KEY);
  return value === "en-US" || value === "ne-NP" ? value : null;
}

export async function setStoredLanguage(value: LanguageCode) {
  await AsyncStorage.setItem(LANG_KEY, value);
}

export { createId };
