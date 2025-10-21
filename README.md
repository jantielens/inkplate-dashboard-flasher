# Inkplate Firmware Flasher

A static web-based flasher for Inkplate firmware using the Web Serial API and ESP Web Tools. Flash your Inkplate device directly from your browser without additional software.

**URL:** https://jantielens.github.io/inkplate-dashboard-flasher/

## Features

- 🚀 **Web-based flashing** - No software installation required
- 📦 **Automatic firmware discovery** - Loads latest firmware from manifest
- 🎯 **Board selection** - Support for multiple Inkplate board types
- 📊 **Progress tracking** - Real-time flashing progress
- 💾 **Local file upload** - Flash custom firmware builds
- 📱 **Responsive design** - Works on desktop and mobile browsers
- ⚡ **Fast & minimal** - No unnecessary dependencies

## Browser Support

This flasher requires the Web Serial API, which is currently available in:

- ✅ **Chrome** (v89+)
- ✅ **Edge** (v89+)
- ✅ **Opera** (v75+)
- ❌ **Firefox** - Not supported (no Web Serial API)
- ❌ **Safari** - Not supported (no Web Serial API)

### Chrome/Edge Requirements

- **Chromium-based** version (not Chromium itself)
- **HTTPS** connection (or localhost for testing)
- **Platform support**: Windows, macOS, Linux

## How to Use

### Automatic Flashing (Recommended)

1. Visit https://jantielens.github.io/inkplate-dashboard-flasher/
2. Wait for firmware options to load
3. Select your Inkplate board from the dropdown
4. Click **Connect & Flash**
5. Select your device's serial port from the browser prompt
6. Confirm device information
7. Wait for flashing to complete
8. Device will restart with new firmware

### Local File Upload (Fallback)

If automatic firmware loading fails:

1. Scroll to **Upload Local Firmware** section
2. Select a `.bin` file from your computer
3. Click **Flash Local File**
4. Follow the same connection flow

## Troubleshooting

### "Port not found" Error
- **Solution**: Ensure your Inkplate device is connected via USB
- Check that the USB cable is a data cable (not charge-only)
- Try a different USB port
- Restart your device and browser

### "No port selected" or Connection Cancelled
- **Solution**: You must select a serial port when prompted
- Click **Try Again** and select your device from the browser's device selection dialog

### "Manifest loading failed"
- **Solution**: Firmware manifest could not be loaded from the server
- Use the **Local File Upload** section to upload a `.bin` file manually
- Check your internet connection

### "Failed to fetch" or "Failed to download firmware"
- **Solution**: The firmware binary download failed (CORS or network issue)
- **Best approach**: Use the **Upload Local Firmware** section instead
- Download the `.bin` file manually from [releases](https://github.com/jantielens/inkplate-dashboard/releases)
- Then upload it using the flasher's local file feature
- This works 100% of the time and avoids network issues

### Browser Shows "Serial not available"
- **Solution**: Your browser doesn't support Web Serial API
- Use Chrome, Edge, or Opera (v75+)
- Ensure you're using HTTPS (or localhost)
- Check that your operating system is Windows, macOS, or Linux

### Device Doesn't Restart After Flashing
- **Solution**: Some devices need manual reset
- Press the reset button on your Inkplate
- Or, power cycle the device (disconnect USB, wait 5 seconds, reconnect)

### Flash Appears to Hang
- **Solution**: Close the browser tab and try again
- Disconnect and reconnect the USB cable
- Try a different USB port
- Restart your computer

## Manifest Format

The flasher loads firmware information from `latest.json`:

```json
{
  "tag_name": "v1.2.3",
  "published_at": "2025-10-21T12:34:56Z",
  "assets": [
    {
      "board": "inkplate10",
      "display_name": "Inkplate 10",
      "filename": "inkplate10-v1.2.3.bin",
      "url": "https://github.com/jantielens/inkplate-dashboard/releases/download/v1.2.3/inkplate10-v1.2.3.bin"
    },
    {
      "board": "inkplate5v2",
      "display_name": "Inkplate 5 V2",
      "filename": "inkplate5v2-v1.2.3.bin",
      "url": "https://github.com/jantielens/inkplate-dashboard/releases/download/v1.2.3/inkplate5v2-v1.2.3.bin"
    }
  ]
}
```

### Manifest Fields

- **tag_name**: Release version tag
- **published_at**: ISO 8601 timestamp of release
- **assets**: Array of firmware binaries
  - **board**: Board identifier (used internally)
  - **display_name**: User-friendly board name (shown in dropdown)
  - **filename**: Binary filename
  - **url**: HTTPS URL to download the `.bin` file

## Publishing Firmware

To publish new firmware:

1. Create a release in [jantielens/inkplate-dashboard](https://github.com/jantielens/inkplate-dashboard)
2. Upload `.bin` files as release assets
3. The release workflow will automatically generate and publish `latest.json` to this repo

See the [main repo](https://github.com/jantielens/inkplate-dashboard) for workflow configuration details.

## Local Testing

To test locally:

1. Clone this repository:
   ```bash
   git clone https://github.com/jantielens/inkplate-dashboard-flasher.git
   cd inkplate-dashboard-flasher
   ```

2. Start a local HTTPS server (required for Web Serial API):
   ```bash
   # Using Python 3.8+
   python3 -m http.server 8000
   
   # Then visit: https://localhost:8000
   # (You'll need to accept the self-signed certificate warning)
   ```

   Or use a tool like `live-server` with SSL support.

3. Test with a real Inkplate device or an ESP32 board

### Real Flashing

The flasher uses **esptool-js** for actual ESP32 firmware programming. It will:
1. Download the firmware binary from the manifest URL
2. Connect to your ESP32 device via Web Serial API
3. Erase the flash memory
4. Write the firmware binary starting at offset 0x1000
5. Disconnect and display completion message

Your device will automatically restart with the new firmware.

## File Structure

```
inkplate-dashboard-flasher/
├── index.html          # Main UI
├── styles.css          # Styling
├── flash.js            # Core flashing logic
├── latest.json         # Firmware manifest (auto-updated)
├── README.md           # This file
└── LICENSE             # License file
```

## Technologies Used

- **HTML5** - Markup
- **CSS3** - Styling
- **Vanilla JavaScript** - No frontend framework
- **Web Serial API** - Device communication
- **esptool-js** - Firmware flashing via CDN (real ESP32 programming library)

## License

See [LICENSE](LICENSE) file for details.

## Support

For issues or questions:
- Check the [Troubleshooting](#troubleshooting) section
- Open an issue on [GitHub](https://github.com/jantielens/inkplate-dashboard-flasher/issues)
- See the related [main repo](https://github.com/jantielens/inkplate-dashboard) for firmware questions
