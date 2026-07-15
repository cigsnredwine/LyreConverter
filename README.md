# Lyre Converter

Lyre Converter is a private, local desktop app for converting video and audio files without uploading them to a server. It supports batch queues of up to 50 files and uses bundled FFmpeg processing.

## Install from a release

Download the release for your operating system from the project's GitHub Releases page. Packaged applications include the Electron runtime and FFmpeg, so Node.js and FFmpeg do not need to be installed separately.

### macOS

1. Download the `.dmg` for your Mac:
   - Apple Silicon: `arm64`
   - Intel: `x64`
   - Universal: works on both
2. Open the DMG and drag **Lyre Converter** to Applications.
3. Open it from Applications.

Unsigned builds may require choosing **Open Anyway** in **System Settings → Privacy & Security**.

### Windows

1. Download the Windows `.exe` installer.
2. Run the installer and follow the prompts.
3. Launch **Lyre Converter** from the Start menu.

Windows may show a SmartScreen warning for unsigned builds. Only install releases downloaded from the official repository.

### Linux

1. Download the `.AppImage` file.
2. Make it executable:

   ```bash
   chmod +x Lyre\ Converter-*.AppImage
   ```

3. Launch it:

   ```bash
   ./Lyre\ Converter-*.AppImage
   ```

## Build from source

For development, install Node.js 20 or newer and npm:

```bash
npm install
npm run dev:desktop
```

To create a local packaged build for the current operating system:

```bash
npm run build:desktop
```

The packaged app is written to `release/`.

## Privacy

Files are processed locally on your computer. Lyre Converter does not upload media or require an account.
