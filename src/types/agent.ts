export type LanguageCode = "ne-NP" | "en-US";

export type Contact = {
  type: "phone" | "email" | "website" | "social";
  label: string;
  value: string;
  url?: string;
};

export type Source = {
  title: string;
  url: string;
  verifiedAt: string;
};

export type AgentResult = {
  intent: string;
  service: string;
  confidence: "high" | "medium" | "low";
  answer: string;
  followUpQuestion?: string;
  agency?: {
    name: string;
    parent?: string;
    address?: string;
    contacts: Contact[];
    sources: Source[];
    lastVerifiedAt?: string;
  };
  messageDraft?: {
    nepali: string;
    english: string;
  };
};

export type ChatSession = {
  id: string;
  title: string;
  subject?: string | null;
  language: LanguageCode;
  preview?: string;
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  result?: AgentResult;
  createdAt: string;
};

export type AgentRequest = {
  text: string;
  language: LanguageCode;
  deviceId?: string;
  sessionId?: string;
};

export type AskResponse = AgentResult & {
  session?: ChatSession | null;
  startedNewSession?: boolean;
};
