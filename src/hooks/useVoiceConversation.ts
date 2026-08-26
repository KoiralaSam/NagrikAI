import { useCallback, useEffect, useRef, useState } from "react";
import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { LanguageCode } from "../types/agent";

type Options = {
  language: LanguageCode;
  contextualStrings: string[];
  onUtterance: (text: string) => Promise<void>;
  onDictation?: (text: string) => void;
};

export function useVoiceConversation({
  language,
  contextualStrings,
  onUtterance,
  onDictation,
}: Options) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [dictationMode, setDictationMode] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const conversationModeRef = useRef(false);
  const dictationModeRef = useRef(false);
  const busyRef = useRef(false);
  const onUtteranceRef = useRef(onUtterance);
  const onDictationRef = useRef(onDictation);
  const languageRef = useRef(language);
  const contextualStringsRef = useRef(contextualStrings);

  onUtteranceRef.current = onUtterance;
  onDictationRef.current = onDictation;
  languageRef.current = language;
  contextualStringsRef.current = contextualStrings;

  const setConversation = (value: boolean) => {
    conversationModeRef.current = value;
    setConversationMode(value);
  };

  const setDictation = (value: boolean) => {
    dictationModeRef.current = value;
    setDictationMode(value);
  };

  const startListening = useCallback(async () => {
    const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    if (!available) {
      setError("Speech recognition is not available on this device.");
      setConversation(false);
      setDictation(false);
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError("Microphone and speech recognition permission are required.");
      setConversation(false);
      setDictation(false);
      return;
    }

    Speech.stop();
    setError(null);
    setLiveTranscript("");
    ExpoSpeechRecognitionModule.start({
      lang: languageRef.current,
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      contextualStrings: contextualStringsRef.current,
      addsPunctuation: true,
      iosTaskHint: "dictation",
      iosCategory: {
        category: "playAndRecord",
        categoryOptions: ["defaultToSpeaker", "allowBluetooth"],
        mode: "voiceChat",
      },
      androidIntentOptions: {
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1200,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 900,
      },
      volumeChangeEventOptions: {
        enabled: true,
        intervalMillis: 120,
      },
    });
  }, []);

  const stopListening = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Recognition may already be idle.
    }
    setIsListening(false);
  }, []);

  const stopConversation = useCallback(() => {
    setConversation(false);
    setDictation(false);
    busyRef.current = false;
    stopListening();
    Speech.stop();
    setIsSpeaking(false);
    setLiveTranscript("");
  }, [stopListening]);

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent("volumechange", (event) => {
    setVolume(event.value);
  });

  useSpeechRecognitionEvent("result", (event) => {
    const nextTranscript = event.results[0]?.transcript?.trim() ?? "";
    if (nextTranscript) {
      setLiveTranscript(nextTranscript);
    }

    if (!event.isFinal || !nextTranscript || busyRef.current) {
      return;
    }

    if (conversationModeRef.current) {
      busyRef.current = true;
      stopListening();
      onUtteranceRef.current(nextTranscript).finally(() => {
        busyRef.current = false;
        setLiveTranscript("");
      });
      return;
    }

    if (dictationModeRef.current) {
      onDictationRef.current?.(nextTranscript);
      setDictation(false);
      stopListening();
      setLiveTranscript("");
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    setIsListening(false);
    if (event.error === "aborted" || event.error === "no-speech") {
      return;
    }

    setError(event.message || `Speech recognition failed: ${event.error}`);
    if (conversationModeRef.current) {
      setConversation(false);
    }
    if (dictationModeRef.current) {
      setDictation(false);
    }
  });

  const speakReply = useCallback(
    (text: string) => {
      Speech.stop();
      setIsSpeaking(true);
      Speech.speak(text, {
        language: languageRef.current,
        pitch: 1,
        rate: 0.92,
        onDone: () => {
          setIsSpeaking(false);
          if (conversationModeRef.current) {
            startListening();
          }
        },
        onStopped: () => {
          setIsSpeaking(false);
        },
        onError: () => {
          setIsSpeaking(false);
          if (conversationModeRef.current) {
            startListening();
          }
        },
      });
    },
    [startListening],
  );

  const toggleConversation = useCallback(async () => {
    if (conversationModeRef.current) {
      stopConversation();
      return;
    }

    setDictation(false);
    setConversation(true);
    await startListening();
  }, [startListening, stopConversation]);

  const toggleDictation = useCallback(async () => {
    if (dictationModeRef.current || (isListening && !conversationModeRef.current)) {
      setDictation(false);
      stopListening();
      setLiveTranscript("");
      return;
    }

    if (conversationModeRef.current) {
      stopConversation();
    }

    setDictation(true);
    await startListening();
  }, [isListening, startListening, stopConversation, stopListening]);

  useEffect(() => {
    return () => {
      stopConversation();
    };
  }, [stopConversation]);

  return {
    isListening,
    isSpeaking,
    conversationMode,
    dictationMode,
    liveTranscript,
    volume,
    error,
    setError,
    startListening,
    toggleConversation,
    toggleDictation,
    stopConversation,
    speakReply,
  };
}
