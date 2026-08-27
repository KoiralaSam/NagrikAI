import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Speech from "expo-speech";
import { ResultExtras } from "./ResultExtras";
import { SpeakerIcon } from "./SpeakerIcon";
import { colors } from "../theme/colors";
import { ChatMessage, LanguageCode } from "../types/agent";

type Props = {
  message: ChatMessage;
  language: LanguageCode;
};

export function ChatBubble({ message, language }: Props) {
  const [speaking, setSpeaking] = useState(false);

  if (message.role === "system") {
    return (
      <View style={styles.systemWrap}>
        <Text style={styles.systemText}>{message.text}</Text>
      </View>
    );
  }

  const isUser = message.role === "user";

  const speak = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }

    Speech.stop();
    setSpeaking(true);
    Speech.speak(message.text, {
      language,
      pitch: 1,
      rate: 0.92,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
          {message.text}
        </Text>
        {!isUser && message.result ? (
          <ResultExtras answerText={message.text} result={message.result} />
        ) : null}
        {!isUser ? (
          <Pressable
            accessibilityLabel={speaking ? "Stop speaking" : "Play reply"}
            accessibilityRole="button"
            hitSlop={8}
            onPress={speak}
            style={styles.speak}
          >
            <SpeakerIcon active={speaking} />
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
    alignSelf: "flex-end",
    marginTop: 6,
    padding: 2,
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
