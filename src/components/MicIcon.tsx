import { StyleSheet, View } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  active: boolean;
  compact?: boolean;
};

export function MicIcon({ active, compact = false }: Props) {
  if (active) {
    return <View style={[styles.stop, compact && styles.stopCompact]} />;
  }

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={[styles.head, compact && styles.headCompact]} />
      <View style={[styles.stem, compact && styles.stemCompact]} />
      <View style={[styles.yoke, compact && styles.yokeCompact]} />
      <View style={[styles.base, compact && styles.baseCompact]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    height: 34,
    justifyContent: "flex-start",
    width: 28,
  },
  wrapCompact: {
    height: 22,
    width: 18,
  },
  head: {
    backgroundColor: colors.primaryDark,
    borderRadius: 10,
    height: 20,
    width: 14,
  },
  headCompact: {
    borderRadius: 7,
    height: 12,
    width: 9,
  },
  stem: {
    backgroundColor: colors.primaryDark,
    height: 6,
    width: 2,
  },
  stemCompact: {
    height: 4,
    width: 1.5,
  },
  yoke: {
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderColor: colors.primaryDark,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    height: 8,
    marginTop: -8,
    width: 22,
  },
  yokeCompact: {
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    height: 6,
    marginTop: -5,
    width: 14,
  },
  base: {
    backgroundColor: colors.primaryDark,
    height: 2,
    marginTop: 2,
    width: 12,
  },
  baseCompact: {
    height: 1.5,
    marginTop: 1,
    width: 8,
  },
  stop: {
    backgroundColor: colors.primaryDark,
    borderRadius: 4,
    height: 18,
    width: 18,
  },
  stopCompact: {
    borderRadius: 3,
    height: 12,
    width: 12,
  },
});
