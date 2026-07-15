# Lyre Converter

Lyre Converter is a dark-mode Electron desktop application for converting video and audio files locally with FFmpeg. Files are processed on the computer and are not uploaded to a server.

## Features

- Convert up to 50 files in one queue
- Mix video and audio files in the same queue
- Choose one output format for all files or configure files individually
- View file size, duration, resolution, format, and conversion progress
- Download converted files individually or all at once
- Select the destination folder before conversion
- Preserve existing files by adding a numbered suffix to duplicate filenames
- Reveal downloaded files in Finder or the operating system's file manager
- Run conversions with bundled native FFmpeg and FFprobe binaries

## Supported output formats

| Format | Video codec | Audio codec |
| --- | --- | --- |
| MP4 | H.264 | AAC |
| MOV | H.264 | AAC |
| WebM | VP9 | Opus |
| MKV | H.264 | AAC |
| AVI | MPEG-4 | MP3 |
| M4V | H.264 | AAC |
| OGV | Theora | Vorbis |
| GIF | Animated GIF | None |
| MP3 | None | MP3 |
| WAV | None | PCM |
| M4A | None | AAC |
| AAC | None | AAC (ADTS) |
| FLAC | None | FLAC |
| OGG | None | Vorbis |
| Opus | None | Opus |
| WMA | None | Windows Media Audio |
| AIFF | None | PCM (big-endian) |

Input compatibility depends on the decoders included with the bundled FFmpeg build. Common formats such as MP4, MOV, MKV, AVI, WebM, M4V, OGV, MTS, M2TS, MP3, M4A, AAC, FLAC, OGG, and Opus are accepted by the file picker.

## Requirements

- Node.js 20 or newer
- npm
- macOS, Windows, or Linux

FFmpeg does not need to be installed separately. The application uses `ffmpeg-static` and `ffprobe-static`.

## Privacy and security

Lyre Converter is designed as a local-only desktop app. Selected paths are passed through a context-isolated Electron preload bridge; the renderer does not receive Node.js access. Conversion runs with bundled FFmpeg/FFprobe processes, and the app does not upload media or require an account.

The main process validates input paths, restricts output formats, limits input/output sizes, rejects unsafe output destinations, prevents renderer navigation and new windows, and denies permission requests. Temporary conversion files are stored in the operating system temp directory and are removed when conversion fails, when the app starts, and when the app exits. Exiting before saving discards unsaved results.

Do not put `.env` files, certificates, private keys, API keys, passwords, or release tokens in the repository. The repository `.gitignore` excludes common signing and credential files. Run `npm audit` before every public release.

## Install and run

Install dependencies:

```bash
npm install
```

Start the Electron application in development mode:

```bash
npm run dev:desktop
```

The command starts Vite on `127.0.0.1:5173` and opens the Electron window. Stop both processes with `Ctrl+C` in the terminal.

## Using the app

1. Drag video or audio files into the drop area or select **Choose files**.
2. Select an output format for each file, or use **Convert all to**.
3. Select **Convert**.
4. Choose the folder where downloaded results should be saved. Canceling the folder dialog cancels the conversion request.
5. Wait for the queue to finish. **Pause queue** pauses before the next file; it does not suspend a conversion already in progress.
6. Select **Download** beside a completed file, or select **Download all**.
7. After downloading an individual file, select **Show file** to reveal it in the file manager.

Converted results are first written to the operating system's temporary directory. They are copied to the selected destination only when **Save file** or **Save all** is selected.

If a destination already contains a file with the same name, the application creates a new name such as `video (2).mp4` instead of overwriting the existing file.

## Build

Create the production renderer assets and run TypeScript validation:

```bash
npm run build
```

Create an unpacked desktop application for the current operating system:

```bash
npm run build:desktop
```

Build output is written under `dist/`. Platform icons are stored under `build/icons/`. Unsigned macOS packaging may request access to a local signing identity or keychain; public distribution requires a Developer ID certificate and notarization.

## Project structure

```text
electron/
  main.mjs       Electron window, FFmpeg processes, dialogs, and file saving
  preload.cjs    Safe renderer-to-main process API bridge
src/
  App.tsx        Queue and download interface
  converter.ts  Renderer-side conversion request wrapper
  desktop.d.ts   Desktop bridge TypeScript definitions
  styles.css     Application theme and layout
  types.ts       Queue item types
  main.tsx       React entry point
index.html       Renderer HTML entry point
package.json     Scripts, dependencies, and packaging configuration
```

## Architecture

The React renderer cannot access Node.js directly. Electron runs with `contextIsolation` enabled and `nodeIntegration` disabled. The CommonJS preload exposes a narrow `window.desktop` API for:

- Reading selected file paths
- Inspecting media with FFprobe
- Starting native FFmpeg conversions
- Receiving conversion progress
- Opening the destination-folder dialog
- Copying completed temporary files to the chosen folder
- Revealing saved files

## Troubleshooting

### “Lyre Converter must be opened as a desktop app”

Run `npm run dev:desktop`, not `npm run dev`. Restart Electron completely after changing the preload or Electron main-process files.

### The app does not open

Check the terminal that started `npm run dev:desktop`. Ensure port `5173` is available, then stop stale development processes and run the command again.

### A file cannot be converted

Try a common output such as MP4. Some source codecs may not be supported by the bundled FFmpeg build. The failed item remains in the queue and can be retried.

### The packaged macOS app will not launch

Unsigned or partially signed development builds may be blocked by Gatekeeper. Use `npm run dev:desktop` while developing, or configure a valid signing identity for distribution.

### Download created a second filename

This is intentional. Existing destination files are never overwritten; a numeric suffix is added to the new file.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start only the Vite renderer server |
| `npm run dev:desktop` | Start Vite and Electron together |
| `npm run build` | Type-check and build renderer assets |
| `npm run build:desktop` | Build renderer assets and package the desktop app |
| `npm test` | Run automated format and temporary-file cleanup tests |
| `npm run build:release` | Build unsigned release artifacts without publishing |

## Current limitations

- Automated unit tests cover format compatibility and cleanup; full media conversion and UI end-to-end tests are still recommended before a major release.
- Queue pause takes effect between files only.
- Conversion jobs run sequentially.
- Temporary conversion files are cleaned on application start and quit; unsaved results are discarded when the app exits.
- Release signing and notarization still require platform credentials.

## Automated verification

Run the local checks before committing:

```bash
npm test
npm run build
node --check electron/main.mjs
```

The GitHub Actions matrix in `.github/workflows/ci.yml` repeats the tests and builds an unpacked Electron app on macOS, Windows, and Linux. This is the cross-platform smoke test; it does not replace testing the final installers on clean machines.

## Updates and releases

The packaged app checks for updates through `electron-updater` and shows an in-app download/restart prompt when an update is available. The current publisher is configured for `cigsnredwine/LyreConverter`.

To publish a release from a CI environment, provide a short-lived `GH_TOKEN` with permission to create releases and run:

```bash
npm run build
npx electron-builder --publish always
```

Never commit signing keys or release tokens. Users must install a signed/notarized artifact for macOS Gatekeeper to trust it without an override.

### Release artifacts

Build the appropriate platform artifact on its native runner:

```bash
npx electron-builder --mac dmg zip --arm64
npx electron-builder --mac dmg zip --x64
npx electron-builder --mac dmg zip --universal
npx electron-builder --win nsis
npx electron-builder --linux AppImage
```

The unpacked `--dir` output is for testing. Publish the generated DMG/ZIP/NSIS/AppImage artifacts instead.

Cross-platform verification runs in `.github/workflows/ci.yml` on macOS, Windows, and Linux. It runs `npm test`, the renderer build, and an unpacked Electron package build on each runner.
