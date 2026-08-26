import { Platform, StatusBar } from "react-native";

export function getTopInset() {
  const measured = StatusBar.currentHeight ?? 0;

  if (Platform.OS === "android") {
    return Math.max(measured, 52);
  }

  return measured || 47;
}

export function getBottomInset() {
  return Platform.OS === "android" ? 32 : 16;
}
