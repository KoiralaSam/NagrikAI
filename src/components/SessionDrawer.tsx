import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { getBottomInset, getTopInset } from "../lib/insets";
import { colors } from "../theme/colors";
import { ChatSession } from "../types/agent";

type Props = {
  open: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  currentSessionId?: string | null;
  loadError?: string | null;
  onOpenSession: (session: ChatSession) => void;
  onDeleteSession: (session: ChatSession) => void;
};

function CloseIcon() {
  return (
    <View style={styles.closeIcon}>
      <View style={[styles.closeBar, styles.closeBarA]} />
      <View style={[styles.closeBar, styles.closeBarB]} />
    </View>
  );
}

function TrashIcon() {
  return (
    <View style={styles.trash}>
      <View style={styles.trashLidCap} />
      <View style={styles.trashLid} />
      <View style={styles.trashBody}>
        <View style={styles.trashLine} />
        <View style={styles.trashLine} />
        <View style={styles.trashLine} />
      </View>
    </View>
  );
}

export function SessionDrawer({
  open,
  onClose,
  sessions,
  currentSessionId,
  loadError,
  onOpenSession,
  onDeleteSession,
}: Props) {
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(360, Math.round(width * 0.8));
  const translateX = useRef(new Animated.Value(-panelWidth)).current;
  const overlay = useRef(new Animated.Value(0)).current;
  const visibleRef = useRef(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      visibleRef.current = true;
      setVisible(true);
      translateX.setValue(-panelWidth);
      overlay.setValue(0);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(overlay, {
          toValue: 1,
          duration: 140,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!visibleRef.current) {
      return;
    }

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -panelWidth,
        duration: 120,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(overlay, {
        toValue: 0,
        duration: 100,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        visibleRef.current = false;
        setVisible(false);
      }
    });
  }, [open, overlay, panelWidth, translateX]);

  return (
    <Modal
      animationType="none"
      hardwareAccelerated
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close recents"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        >
          <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: overlay }]} />
        </Pressable>
        <Animated.View
          style={[
            styles.panel,
            {
              width: panelWidth,
              paddingTop: getTopInset() + 8,
              paddingBottom: getBottomInset(),
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={styles.title}>Recents</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close recents"
              hitSlop={8}
              onPress={onClose}
              style={styles.closeButton}
            >
              <CloseIcon />
            </Pressable>
          </View>

          {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

          <FlatList
            style={styles.list}
            data={sessions}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {loadError
                  ? "Could not load saved chats from the server."
                  : "No saved conversations yet. Send a request and it will appear here."}
              </Text>
            }
            renderItem={({ item }) => {
              const selected = item.id === currentSessionId;
              return (
                <Pressable
                  onPress={() => onOpenSession(item)}
                  style={[styles.session, selected && styles.sessionSelected]}
                >
                  <Text numberOfLines={1} style={styles.sessionTitle}>
                    {item.title}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Delete conversation"
                    hitSlop={6}
                    onPress={() => onDeleteSession(item)}
                    style={styles.deleteButton}
                  >
                    <TrashIcon />
                  </Pressable>
                </Pressable>
              );
            }}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: colors.overlay,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  panel: {
    backgroundColor: colors.drawer,
    bottom: 0,
    elevation: 16,
    left: 0,
    paddingHorizontal: 18,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    top: 0,
    zIndex: 2,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  closeButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  closeIcon: {
    height: 16,
    width: 16,
  },
  closeBar: {
    backgroundColor: colors.text,
    borderRadius: 1,
    height: 2,
    left: 0,
    position: "absolute",
    top: 7,
    width: 16,
  },
  closeBarA: {
    transform: [{ rotate: "45deg" }],
  },
  closeBarB: {
    transform: [{ rotate: "-45deg" }],
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  list: {
    flex: 1,
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 20,
  },
  session: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    marginHorizontal: -8,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  sessionSelected: {
    backgroundColor: colors.drawerActive,
  },
  sessionTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "400",
  },
  deleteButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  trash: {
    alignItems: "center",
    height: 18,
    width: 16,
  },
  trashLidCap: {
    backgroundColor: colors.muted,
    borderRadius: 1,
    height: 2,
    width: 6,
  },
  trashLid: {
    backgroundColor: colors.muted,
    borderRadius: 1,
    height: 2,
    marginTop: 1,
    width: 16,
  },
  trashBody: {
    alignItems: "center",
    borderColor: colors.muted,
    borderRadius: 2,
    borderWidth: 1.5,
    flexDirection: "row",
    flex: 1,
    gap: 2,
    justifyContent: "center",
    marginTop: 1,
    paddingHorizontal: 3,
    paddingVertical: 2,
    width: 13,
  },
  trashLine: {
    backgroundColor: colors.muted,
    flex: 1,
    width: 1.5,
  },
});
