import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Speech from "expo-speech";
import { ResultExtras } from "./ResultExtras";
import { colors } from "../theme/colors";
import { ChatMessage, LanguageCode } from "../types/agent";

type Props = {
  message: ChatMessage;
  language: LanguageCode;
};

export function ChatBubble({ message, language }: Props) {
  if (message.role === "system") {
    return (
      <View style={styles.systemWrap}>
        <Text style={styles.systemText}>{message.text}</Text>
      </View>
    );
  }

  const isUser = message.role === "user";

  const speak = () => {
    Speech.stop();
    Speech.speak(message.text, {
      language,
      pitch: 1,
      rate: 0.92,
    });
  };

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
          {message.text}
        </Text>
        {!isUser && message.result ? (
          <ResultExtras result={message.result} language={language} />
        ) : null}
        {!isUser ? (
          <Pressable onPress={speak} style={styles.speak}>
            <Text style={styles.speakLabel}>Play</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 10,
    maxWidth: "100%",
  },
  rowUser: {
    alignItems: "flex-end",
  },
  rowAssistant: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "86%",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: colors.userBubble,
    borderBottomRightRadius: 6,
    borderRadius: 20,
  },
  assistantBubble: {
    backgroundColor: colors.panel,
    borderBottomLeftRadius: 6,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: colors.userText,
  },
  assistantText: {
    color: colors.text,
  },
  speak: {
    alignSelf: "flex-start",
    marginTop: 8,
  },
  speakLabel: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "800",
  },
  systemWrap: {
    alignItems: "center",
    marginVertical: 8,
  },
  systemText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
});
