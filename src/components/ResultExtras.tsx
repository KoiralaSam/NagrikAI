import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { AgentResult, LanguageCode } from "../types/agent";

type Props = {
  result: AgentResult;
  language: LanguageCode;
};

const confidenceCopy = {
  high: "Verified",
  medium: "Likely",
  low: "Review",
};

export function ResultExtras({ result, language }: Props) {
  const message =
    language === "ne-NP"
      ? result.messageDraft?.nepali
      : result.messageDraft?.english;

  return (
    <View style={styles.card}>
      <View style={styles.statusRow}>
        <Text style={styles.badge}>{confidenceCopy[result.confidence]}</Text>
        {result.agency?.lastVerifiedAt ? (
          <Text style={styles.verified}>Verified {result.agency.lastVerifiedAt}</Text>
        ) : null}
      </View>

      {result.agency ? (
        <Text style={styles.agency}>
          {result.service}
          {result.agency.name ? ` · ${result.agency.name}` : ""}
        </Text>
      ) : (
        <Text style={styles.agency}>{result.service}</Text>
      )}

      {result.followUpQuestion ? (
        <Text style={styles.followUp}>{result.followUpQuestion}</Text>
      ) : null}

      {result.agency?.contacts.length ? (
        <View style={styles.actions}>
          {result.agency.contacts.map((contact) => {
            const onPress = () => {
              if (contact.type === "phone") {
                Linking.openURL(`tel:${contact.value.replace(/\s/g, "")}`);
                return;
              }

              if (contact.type === "email") {
                Linking.openURL(`mailto:${contact.value}`);
                return;
              }

              Linking.openURL(contact.url ?? contact.value);
            };

            return (
              <Pressable
                key={`${contact.type}-${contact.value}`}
                onPress={onPress}
                style={styles.actionChip}
              >
                <Text style={styles.actionLabel}>{contact.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {message ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageLabel}>Prepared message</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
      ) : null}

      {result.agency?.sources.length ? (
        <View style={styles.sources}>
          {result.agency.sources.map((source) => (
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
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  badge: {
    backgroundColor: colors.mint,
    borderRadius: 6,
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  verified: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  agency: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  followUp: {
    backgroundColor: colors.peach,
    borderRadius: 10,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  actionChip: {
    backgroundColor: colors.mint,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionLabel: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "700",
  },
  messageBox: {
    backgroundColor: colors.lavender,
    borderRadius: 10,
    gap: 4,
    padding: 10,
  },
  messageLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  message: {
    color: colors.text,
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
