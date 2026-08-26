import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  prompts: string[];
  onSelect: (prompt: string) => void;
};

export function SuggestionChips({ prompts, onSelect }: Props) {
  return (
    <View style={styles.wrap}>
      {prompts.map((prompt) => (
        <Pressable
          key={prompt}
          onPress={() => onSelect(prompt)}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <Text style={styles.label}>{prompt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    alignSelf: "stretch",
    gap: 8,
    paddingHorizontal: 12,
  },
  chip: {
    alignSelf: "center",
    backgroundColor: colors.chipFill,
    borderColor: colors.chipBorder,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "100%",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: "600",
  },
});
