import { useEffect, useState } from "react";
import { Dimensions, Keyboard, Platform } from "react-native";

export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (event) => {
      const screenHeight = Dimensions.get("screen").height;
      const fromScreen = screenHeight - event.endCoordinates.screenY;
      const reported = event.endCoordinates.height;
      setHeight(Math.max(fromScreen, reported, 0));
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setHeight(0);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
