import { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ConversationIcon } from "./ConversationIcon";
import { MicIcon } from "./MicIcon";
import { colors } from "../theme/colors";
import { LanguageCode } from "../types/agent";

type Props = {
  language: LanguageCode;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  isLoading: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  conversationMode: boolean;
  dictationMode: boolean;
  liveTranscript: string;
  volume: number;
  onMicPress: () => void;
  onConversationPress: () => void;
  bottomInset?: number;
  keyboardOpen?: boolean;
};

export function ComposerBar({
  language,
  input,
  onInputChange,
  onSend,
  canSend,
  isLoading,
  isListening,
  isSpeaking,
  conversationMode,
  dictationMode,
  liveTranscript,
  volume,
  onMicPress,
  onConversationPress,
  bottomInset = 16,
  keyboardOpen = false,
}: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isListening) {
      pulse.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [isListening, pulse]);

  const hasText = input.trim().length > 0;
  const iconScale = pulse.interpolate({
    inputRange: [1, 1.08],
    outputRange: [1, 1 + Math.min(Math.max(volume, 0), 8) / 80],
  });

  return (
    <View
      style={[
        styles.wrap,
        { paddingBottom: keyboardOpen ? 12 : Math.max(bottomInset, 12) },
      ]}
    >
      {isListening && liveTranscript ? (
        <Text style={styles.live}>{liveTranscript}</Text>
      ) : null}

      <View style={[styles.pill, keyboardOpen && styles.pillKeyboard]}>
        <TextInput
          multiline
          scrollEnabled
          textAlignVertical="top"
          onChangeText={onInputChange}
          placeholder={
            language === "ne-NP"
              ? "तपाईंलाई के सहयोग गर्न सक्छु?"
              : "What do you need help with?"
          }
          placeholderTextColor={colors.muted}
          style={[styles.input, keyboardOpen && styles.inputKeyboard]}
          value={input}
        />
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={dictationMode ? "Stop dictation" : "Dictate into the text box"}
            onPress={onMicPress}
            style={styles.iconHit}
          >
            <Animated.View
              style={[
                styles.micButton,
                dictationMode && styles.micActive,
                { transform: [{ scale: dictationMode && isListening ? iconScale : 1 }] },
              ]}
            >
              <MicIcon active={dictationMode} compact />
            </Animated.View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              hasText
                ? "Send"
                : conversationMode
                  ? "Stop voice conversation"
                  : "Start voice conversation"
            }
            disabled={hasText && !canSend}
            onPress={hasText ? onSend : onConversationPress}
            style={styles.iconHit}
          >
            <Animated.View
              style={[
                styles.conversationButton,
                hasText && styles.sendButton,
                !hasText && conversationMode && styles.conversationActive,
                !hasText && isSpeaking && styles.conversationSpeaking,
                hasText && !canSend && styles.disabled,
                {
                  transform: [
                    { scale: !hasText && conversationMode && isListening ? iconScale : 1 },
                  ],
                },
              ]}
            >
              {hasText ? (
                <Text style={styles.sendIcon}>{isLoading ? "..." : "↑"}</Text>
              ) : (
                <ConversationIcon active={conversationMode} light={!conversationMode} />
              )}
            </Animated.View>
          </Pressable>
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.background,
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  live: {
    color: colors.muted,
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
  },
  pill: {
    alignItems: "flex-end",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 52,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  pillKeyboard: {
    minHeight: 56,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 160,
    minHeight: 40,
    paddingVertical: 8,
  },
  inputKeyboard: {
    maxHeight: 120,
    minHeight: 40,
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    paddingBottom: 2,
  },
  iconHit: {
    alignItems: "center",
    justifyContent: "center",
  },
  micButton: {
    alignItems: "center",
    backgroundColor: colors.peach,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  micActive: {
    backgroundColor: colors.lavender,
  },
  conversationButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  conversationActive: {
    backgroundColor: colors.lavender,
  },
  conversationSpeaking: {
    backgroundColor: colors.mint,
  },
  sendButton: {
    backgroundColor: colors.primary,
  },
  disabled: {
    opacity: 0.4,
  },
  sendIcon: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
