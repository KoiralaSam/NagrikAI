import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  label: string;
  onPress: () => void;
  tone?: "primary" | "soft";
};

export function ActionButton({ label, onPress, tone = "soft" }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "primary" ? styles.primary : styles.soft,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, tone === "primary" && styles.primaryLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  soft: {
    backgroundColor: colors.mint,
    borderColor: colors.border,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.78,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  primaryLabel: {
    color: "#FFFFFF",
  },
});
