import { Linking, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { AgentResult } from "../types/agent";

type Props = {
  result: AgentResult;
  answerText: string;
};

export function ResultExtras({ result, answerText }: Props) {
  const followUp =
    result.followUpQuestion &&
    !answerText.includes(result.followUpQuestion)
      ? result.followUpQuestion
      : null;
  const sources = result.agency?.sources ?? [];

  if (!followUp && !sources.length) {
    return null;
  }

  return (
    <View style={styles.card}>
      {followUp ? <Text style={styles.followUp}>{followUp}</Text> : null}

      {sources.length ? (
        <View style={styles.sources}>
          {sources.map((source) => (
            <Text
              key={source.url}
              onPress={() => Linking.openURL(source.url)}
              style={styles.sourceLink}
            >
              {source.title}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    marginTop: 8,
  },
  followUp: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  sources: {
    gap: 4,
  },
  sourceLink: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
