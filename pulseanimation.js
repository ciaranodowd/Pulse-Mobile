import React, { useEffect, useRef } from "react";
import { View, Animated, Easing, StyleSheet } from "react-native";

export default function PulseRipple({
  visible,
  size = 220,
  duration = 1800,
  colors = ["#7C3AED", "#A855F7", "#EC4899", "#22D3EE"],
  onFinish,
}) {
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const ripple3 = useRef(new Animated.Value(0)).current;
  const ripple4 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      ripple1.setValue(0);
      ripple2.setValue(0);
      ripple3.setValue(0);
      ripple4.setValue(0);
      return;
    }

    const makeRipple = (animatedValue, delay = 0) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(animatedValue, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]);

    Animated.parallel([
      makeRipple(ripple1, 0),
      makeRipple(ripple2, 180),
      makeRipple(ripple3, 360),
      makeRipple(ripple4, 540),
    ]).start(() => {
      ripple1.setValue(0);
      ripple2.setValue(0);
      ripple3.setValue(0);
      ripple4.setValue(0);

      if (onFinish) onFinish();
    });
  }, [visible, duration, onFinish, ripple1, ripple2, ripple3, ripple4]);

  const buildStyle = (animatedValue) => ({
    transform: [
      {
        scale: animatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0.25, 2.6],
        }),
      },
    ],
    opacity: animatedValue.interpolate({
      inputRange: [0, 0.2, 0.7, 1],
      outputRange: [0, 0.8, 0.35, 0],
    }),
  });

  return (
    <View pointerEvents="none" style={styles.wrapper}>
      <Animated.View
        style={[
          styles.ripple,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: colors[0],
          },
          buildStyle(ripple1),
        ]}
      />
      <Animated.View
        style={[
          styles.ripple,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: colors[1],
          },
          buildStyle(ripple2),
        ]}
      />
      <Animated.View
        style={[
          styles.ripple,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: colors[2],
          },
          buildStyle(ripple3),
        ]}
      />
      <Animated.View
        style={[
          styles.ripple,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: colors[3],
          },
          buildStyle(ripple4),
        ]}
      />
      <View
        style={[
          styles.core,
          {
            backgroundColor: colors[0],
            shadowColor: colors[2],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  ripple: {
    position: "absolute",
    borderWidth: 4,
    backgroundColor: "transparent",
  },
  core: {
    width: 16,
    height: 16,
    borderRadius: 8,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
});