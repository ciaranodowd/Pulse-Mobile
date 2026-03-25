export default () => {
  const isDevelopment = process.env.APP_VARIANT === "development";

  return {
    expo: {
      owner: "ciaranodowd",
      name: isDevelopment ? "Pulse Dev" : "pulse-mobile",
      slug: "pulse-mobile",
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "light",
      splash: {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
      ios: {
        supportsTablet: true,
        bundleIdentifier: isDevelopment
          ? "com.ciaranodowd.pulsemobile.dev"
          : "com.ciaranodowd.pulsemobile",
        infoPlist: {
          ITSAppUsesNonExemptEncryption: false,
        },
      },
      android: {
        adaptiveIcon: {
          backgroundColor: "#E6F4FE",
          foregroundImage: "./assets/android-icon-foreground.png",
          backgroundImage: "./assets/android-icon-background.png",
          monochromeImage: "./assets/android-icon-monochrome.png",
        },
        package: isDevelopment
          ? "com.ciaranodowd.pulsemobile.dev"
          : "com.ciaranodowd.pulsemobile",
      },
      web: {
        favicon: "./assets/favicon.png",
      },
      extra: {
        eas: {
          projectId: "04135940-74a1-4c21-84a1-cd80abdc3643",
        },
      },
      plugins: ["@rnmapbox/maps"],
    },
  };
};