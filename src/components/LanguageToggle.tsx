import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { LanguageCode } from "../types/agent";

type Props = {
  value: LanguageCode;
  onChange: (value: LanguageCode) => void;
  compact?: boolean;
};

const options: Array<{ label: string; value: LanguageCode }> = [
  { label: "नेपाली", value: "ne-NP" },
  { label: "EN", value: "en-US" },
];

export function LanguageToggle({ value, onChange, compact = false }: Props) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.option, compact && styles.optionCompact, selected && styles.selected]}
          >
            <Text style={[styles.label, compact && styles.labelCompact, selected && styles.selectedLabel]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.lavender,
    borderColor: colors.primary,
    borderRadius: 999,
    borderWidth: 1,
    padding: 3,
  },
  containerCompact: {
    alignSelf: "flex-end",
  },
  option: {
    alignItems: "center",
    borderRadius: 999,
    minWidth: 52,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  optionCompact: {
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  selected: {
    backgroundColor: colors.primary,
  },
  label: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "700",
  },
  labelCompact: {
    fontSize: 11,
  },
  selectedLabel: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});
