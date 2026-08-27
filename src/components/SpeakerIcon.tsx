import { StyleSheet, View } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  active?: boolean;
};

export function SpeakerIcon({ active = false }: Props) {
  const fill = colors.primaryDark;

  if (active) {
    return <View style={styles.stop} />;
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.body, { backgroundColor: fill }]} />
      <View style={[styles.horn, { borderLeftColor: fill }]} />
      <View style={styles.waves}>
        <View style={[styles.wave, styles.waveInner, { borderColor: fill }]} />
        <View style={[styles.wave, styles.waveOuter, { borderColor: fill }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    flexDirection: "row",
    height: 16,
    width: 20,
  },
  body: {
    borderRadius: 1.5,
    height: 7,
    width: 4,
    zIndex: 1,
  },
  horn: {
    borderBottomColor: "transparent",
    borderBottomWidth: 6,
    borderLeftWidth: 8,
    borderTopColor: "transparent",
    borderTopWidth: 6,
    height: 0,
    marginLeft: -1,
    width: 0,
  },
  waves: {
    height: 16,
    marginLeft: 1,
    width: 8,
  },
  wave: {
    borderBottomWidth: 1.5,
    borderLeftWidth: 0,
    borderRightWidth: 1.5,
    borderTopWidth: 1.5,
    position: "absolute",
  },
  waveInner: {
    borderRadius: 6,
    height: 8,
    left: 0,
    top: 4,
    width: 5,
  },
  waveOuter: {
    borderRadius: 8,
    height: 14,
    left: 1,
    top: 1,
    width: 7,
  },
  stop: {
    backgroundColor: colors.primaryDark,
    borderRadius: 3,
    height: 10,
    width: 10,
  },
});
