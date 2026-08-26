import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { AgentResult, Contact, LanguageCode } from "../types/agent";

type Chip = {
  key: string;
  label: string;
  onPress: () => void;
};

function firstContact(contacts: Contact[] | undefined, type: Contact["type"]) {
  return contacts?.find((contact) => contact.type === type);
}

function smsUrl(phone: string, body: string) {
  const number = phone.replace(/\s/g, "");
  const separator = Platform.OS === "ios" ? "&" : "?";
  return `sms:${number}${separator}body=${encodeURIComponent(body)}`;
}

export function shouldShowResultActionChips(result?: AgentResult | null) {
  if (!result) {
    return false;
  }

  if (result.intent === "unknown" || result.intent === "out_of_scope") {
    return false;
  }

  const hasContacts = (result.agency?.contacts.length ?? 0) > 0;
  const hasDraft = Boolean(result.messageDraft?.nepali || result.messageDraft?.english);
  return hasContacts || hasDraft;
}

function buildChips(result: AgentResult, language: LanguageCode): Chip[] {
  const isNepali = language === "ne-NP";
  const contacts = result.agency?.contacts;
  const phone = firstContact(contacts, "phone");
  const email = firstContact(contacts, "email");
  const website = firstContact(contacts, "website");
  const social = firstContact(contacts, "social");
  const draft =
    language === "ne-NP" ? result.messageDraft?.nepali : result.messageDraft?.english;
  const chips: Chip[] = [];

  if (phone) {
    chips.push({
      key: "call",
      label: isNepali ? "कार्यालयलाई फोन" : "Call office",
      onPress: () => Linking.openURL(`tel:${phone.value.replace(/\s/g, "")}`),
    });
  }

  if (draft) {
    chips.push({
      key: "message",
      label: isNepali ? "सन्देश पठाउनुहोस्" : "Send message",
      onPress: () => {
        if (phone) {
          Linking.openURL(smsUrl(phone.value, draft));
          return;
        }
        Share.share({ message: draft });
      },
    });
  }

  if (website) {
    chips.push({
      key: "website",
      label: isNepali ? "वेबसाइट खोल्नुहोस्" : "Open website",
      onPress: () => Linking.openURL(website.url ?? website.value),
    });
  }

  if (email) {
    chips.push({
      key: "email",
      label: isNepali ? "इमेल" : "Email",
      onPress: () => {
        const href = draft
          ? `mailto:${email.value}?body=${encodeURIComponent(draft)}`
          : `mailto:${email.value}`;
        Linking.openURL(href);
      },
    });
  }

  if (social) {
    chips.push({
      key: "social",
      label: social.label || (isNepali ? "सोसल" : "Social"),
      onPress: () => Linking.openURL(social.url ?? social.value),
    });
  }

  return chips;
}

type Props = {
  result: AgentResult;
  language: LanguageCode;
};

export function ResultActionChips({ result, language }: Props) {
  const chips = buildChips(result, language);

  if (!chips.length) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {chips.map((chip) => (
        <Pressable
          key={chip.key}
          onPress={chip.onPress}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <Text numberOfLines={1} style={styles.label}>
            {chip.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  chip: {
    backgroundColor: colors.chipFill,
    borderColor: colors.chipBorder,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
});
