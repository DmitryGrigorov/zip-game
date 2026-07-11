# Zip Path Puzzle

A backend-free React puzzle game. Levels are generated on the device and the current puzzle, route, timer, and progress are stored in local storage. The Android app embeds the production web build, so gameplay does not require a server or internet connection.

## Install for web development

Install Node.js 20 or newer (Node.js 22 LTS is recommended). npm is included with Node.js.

```bash
npm install
npm run dev
```

Create and test the production web build:

```bash
npm run build
npm run preview
```

## Build an Android APK

Install these once:

- Android Studio with the Android SDK
- JDK 17
- Node.js 20 or newer and npm

In Android Studio's SDK Manager, install the current Android SDK Platform, Android SDK Build-Tools, and Android SDK Platform-Tools. Set `JAVA_HOME` and `ANDROID_HOME` if Android Studio did not configure them for your shell.

Prepare or refresh the native Android project:

```bash
npm install
npm run android:sync
```

Build a debug APK:

```bash
npm run android:apk
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

For an emulator, a connected device, or a signed release, open the project in Android Studio:

```bash
npm run android:open
```

For a release APK or Android App Bundle, use **Build > Generate Signed Bundle / APK** in Android Studio and keep the signing key outside this repository.

## Touch controls

Touch the last point in the orange route and slide across neighboring squares. You can also tap one neighboring square at a time. Sliding back to the previous square removes the latest segment. The board follows the finger by its coordinates, including while Android WebView has pointer capture.

## Saved progress

No account or backend is used. Game state is saved automatically in browser or Android WebView local storage under `zip-game-v2`. Clearing site or app storage resets the saved game.
