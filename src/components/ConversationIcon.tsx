import { StyleSheet, View } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  active?: boolean;
  light?: boolean;
};

export function ConversationIcon({ active = false, light = false }: Props) {
  const fill = light ? "#FFFFFF" : colors.primaryDark;

  if (active) {
    return <View style={[styles.stop, { backgroundColor: fill }]} />;
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.bubble, { borderColor: fill }]} />
      <View style={[styles.tail, { borderTopColor: fill }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 18,
    width: 20,
  },
  bubble: {
    borderRadius: 7,
    borderWidth: 2,
    height: 13,
    width: 18,
  },
  tail: {
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    height: 0,
    marginLeft: 3,
    marginTop: -1,
    width: 0,
  },
  stop: {
    borderRadius: 3,
    height: 12,
    width: 12,
  },
});
