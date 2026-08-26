import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  askAgent,
  deleteSession,
  getSession,
  listSessions,
} from "../api/agentClient";
import { ChatBubble } from "../components/ChatBubble";
import { ComposerBar } from "../components/ComposerBar";
import { LanguageToggle } from "../components/LanguageToggle";
import { SessionDrawer } from "../components/SessionDrawer";
import {
  ResultActionChips,
  shouldShowResultActionChips,
} from "../components/ResultActionChips";
import { SuggestionChips } from "../components/SuggestionChips";
import { useVoiceConversation } from "../hooks/useVoiceConversation";
import { getBottomInset, getTopInset } from "../lib/insets";
import { useKeyboardHeight } from "../lib/useKeyboardHeight";
import {
  createId,
  getDeviceId,
  getStoredApiUrl,
  getStoredLanguage,
  setStoredApiUrl,
  setStoredLanguage,
} from "../lib/storage";
import { colors } from "../theme/colors";
import { ChatMessage, ChatSession, LanguageCode } from "../types/agent";

const defaultApiUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "android" ? "http://127.0.0.1:8080" : "http://localhost:8080");

function resolveApiUrl(value: string | null) {
  if (!value) {
    return defaultApiUrl;
  }

  if (value.includes("10.0.2.2")) {
    return defaultApiUrl;
  }

  return value;
}

const promptsByLanguage: Record<LanguageCode, string[]> = {
  "ne-NP": [
    "मेरो नागरिकता हराएको छ",
    "मेरो पासपोर्ट हरायो",
    "सवारी चालक अनुमतिपत्र नवीकरण गर्न कहाँ जाने?",
    "PAN नम्बर बनाउनुपर्छ",
    "विदेशमा पासपोर्ट हरायो",
  ],
  "en-US": [
    "I lost my citizenship certificate",
    "I lost my passport",
    "Where do I renew a driving license?",
    "I need to make a PAN number",
    "I lost my passport abroad",
  ],
};

export function HomeScreen() {
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [language, setLanguage] = useState<LanguageCode>("ne-NP");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const isLoadingRef = useRef(false);
  const sessionRef = useRef<ChatSession | null>(null);
  const submitRef = useRef<(text: string, speak?: boolean) => Promise<void>>(
    async () => undefined,
  );

  sessionRef.current = session;

  const contextualStrings = useMemo(
    () => [
      "नागरिकता",
      "राहदानी",
      "पासपोर्ट",
      "passport",
      "citizenship",
      "PAN",
      "tax",
      "driving license",
      "license renew",
      "विदेश",
      "consular",
      "जग्गा",
    ],
    [],
  );

  const voice = useVoiceConversation({
    language,
    contextualStrings,
    onUtterance: (text) => submitRef.current(text, true),
    onDictation: (text) => {
      setInput((current) => {
        const trimmed = current.trim();
        return trimmed ? `${trimmed} ${text}` : text;
      });
    },
  });

  const refreshSessions = useCallback(async () => {
    if (!deviceId) {
      return;
    }

    try {
      setSessions(await listSessions(apiUrl, deviceId));
      setHistoryError(null);
    } catch (nextError) {
      setHistoryError(
        nextError instanceof Error ? nextError.message : "Could not load recents.",
      );
    }
  }, [apiUrl, deviceId]);

  const startNewChat = useCallback(() => {
    voice.stopConversation();
    setSession(null);
    setMessages([]);
    setInput("");
    setError(null);
    setDrawerOpen(false);
  }, [voice]);

  const submitText = useCallback(
    async (text: string, speak = false) => {
      const requestText = text.trim();
      if (!requestText || isLoadingRef.current || !deviceId) {
        return;
      }

      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);
      setInput("");

      const userMessage: ChatMessage = {
        id: createId(),
        role: "user",
        text: requestText,
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, userMessage]);

      try {
        const response = await askAgent(apiUrl, {
          text: requestText,
          language,
          deviceId,
          sessionId: sessionRef.current?.id,
        });

        const assistantMessage: ChatMessage = {
          id: createId(),
          role: "assistant",
          text: response.answer,
          result: response,
          createdAt: new Date().toISOString(),
        };
        const startedNewTopic = Boolean(
          response.startedNewSession &&
            response.session &&
            sessionRef.current &&
            sessionRef.current.id !== response.session.id,
        );

        setMessages((current) => {
          const withoutUser = current.filter((item) => item.id !== userMessage.id);
          const nextMessages = startedNewTopic
            ? [
                ...withoutUser,
                {
                  id: createId(),
                  role: "system" as const,
                  text: `New topic: ${response.session?.title ?? response.service}`,
                  createdAt: new Date().toISOString(),
                },
                userMessage,
                assistantMessage,
              ]
            : [...withoutUser, userMessage, assistantMessage];

          return nextMessages;
        });

        if (response.session) {
          setSession(response.session);
        }

        if (speak) {
          voice.speakReply(response.answer);
        }

        await refreshSessions();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Request failed.");
        if (speak && voice.conversationMode) {
          voice.startListening();
        }
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [apiUrl, deviceId, language, refreshSessions, voice],
  );

  submitRef.current = submitText;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [storedDeviceId, storedApiUrl, storedLanguage] = await Promise.all([
        getDeviceId(),
        getStoredApiUrl(),
        getStoredLanguage(),
      ]);

      if (cancelled) {
        return;
      }

      setDeviceId(storedDeviceId);
      const nextApiUrl = resolveApiUrl(storedApiUrl);
      setApiUrl(nextApiUrl);
      if (nextApiUrl !== storedApiUrl) {
        setStoredApiUrl(nextApiUrl);
      }
      if (storedLanguage) {
        setLanguage(storedLanguage);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (deviceId) {
      refreshSessions();
    }
  }, [deviceId, refreshSessions]);

  useEffect(() => {
    setStoredLanguage(language);
  }, [language]);

  const openSession = async (next: ChatSession) => {
    if (!deviceId) {
      return;
    }

    voice.stopConversation();
    setDrawerOpen(false);
    setError(null);

    try {
      const payload = await getSession(apiUrl, deviceId, next.id);
      setSession(payload.session);
      setMessages(payload.messages);
      setLanguage(payload.session.language);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not open conversation.");
    }
  };

  const removeSession = async (next: ChatSession) => {
    if (!deviceId) {
      return;
    }

    try {
      await deleteSession(apiUrl, deviceId, next.id);
      if (session?.id === next.id) {
        startNewChat();
      }
      await refreshSessions();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not delete conversation.");
    }
  };

  const title = session?.title ?? (language === "ne-NP" ? "नयाँ कुराकानी" : "New chat");

  const latestAssistantResult = [...messages]
    .reverse()
    .find((item) => item.role === "assistant")?.result;
  const actionChipsResult = shouldShowResultActionChips(latestAssistantResult)
    ? latestAssistantResult
    : undefined;

  const topInset = getTopInset();
  const bottomInset = getBottomInset();
  const keyboardHeight = useKeyboardHeight();
  const keyboardOpen = keyboardHeight > 0;
  const composerOffset =
    Platform.OS === "ios" ? 0 : keyboardOpen ? keyboardHeight + 12 : 0;

  return (
    <View style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        style={styles.flex}
      >
        <View style={[styles.header, { paddingTop: topInset + 6 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open recent conversations"
            hitSlop={8}
            onPress={() => {
              refreshSessions();
              setDrawerOpen(true);
            }}
            style={styles.historyButton}
          >
            <Text style={styles.historyIcon}>☰</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.brand}>NagrikAI</Text>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {title}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start a new chat"
              hitSlop={8}
              onPress={startNewChat}
              style={styles.newButton}
            >
              <Text style={styles.newButtonLabel}>+</Text>
            </Pressable>
            <LanguageToggle compact value={language} onChange={setLanguage} />
          </View>
        </View>

        <FlatList
          ref={listRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            messages.length === 0 && styles.emptyList,
          ]}
          data={messages}
          keyExtractor={(item) => item.id}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {language === "ne-NP"
                  ? "तपाईंलाई के सहयोग गर्न सक्छु?"
                  : "What do you need help with?"}
              </Text>
              <SuggestionChips
                prompts={promptsByLanguage[language]}
                onSelect={(prompt) => submitText(prompt)}
              />
            </View>
          }
          ListFooterComponent={
            isLoading ? (
              <View style={styles.typing}>
                <Text style={styles.typingText}>
                  {language === "ne-NP" ? "NagrikAI लेख्दैछ…" : "NagrikAI is typing…"}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => <ChatBubble language={language} message={item} />}
        />

        {error || voice.error ? (
          <Text style={styles.error}>{error || voice.error}</Text>
        ) : null}

        <View style={{ paddingBottom: composerOffset }}>
          {actionChipsResult ? (
            <ResultActionChips language={language} result={actionChipsResult} />
          ) : null}
          <ComposerBar
            canSend={input.trim().length > 0 && !isLoading}
            conversationMode={voice.conversationMode}
            dictationMode={voice.dictationMode}
            input={input}
            isListening={voice.isListening}
            isLoading={isLoading}
            isSpeaking={voice.isSpeaking}
            language={language}
            liveTranscript={voice.liveTranscript}
            onInputChange={setInput}
            onMicPress={() => {
              voice.toggleDictation();
            }}
            onConversationPress={() => {
              voice.toggleConversation();
            }}
            onSend={() => submitText(input)}
            volume={voice.volume}
            bottomInset={bottomInset}
            keyboardOpen={keyboardOpen}
          />
        </View>
      </KeyboardAvoidingView>

      <SessionDrawer
        currentSessionId={session?.id}
        loadError={historyError}
        onClose={() => setDrawerOpen(false)}
        onDeleteSession={removeSession}
        onOpenSession={openSession}
        open={drawerOpen}
        sessions={sessions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  historyButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  historyIcon: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 28,
  },
  newButton: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  newButtonLabel: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 28,
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  headerCopy: {
    alignItems: "center",
    flex: 1,
    gap: 2,
  },
  brand: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  emptyList: {
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  emptySubtitle: {
    color: colors.muted,
    fontSize: 15,
    marginBottom: 4,
    textAlign: "center",
  },
  typing: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  typingText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  error: {
    backgroundColor: "#F9DEDC",
    borderRadius: 10,
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
    marginHorizontal: 16,
    marginTop: 4,
    padding: 10,
  },
});
