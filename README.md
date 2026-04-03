# Send Note via Email for Obsidian

A high-fidelity Obsidian plugin that allows you to instantly send your notes to your favorite email client (like eM Client, Outlook, or Thunderbird) with full HTML formatting and **embedded images** intact.

## Why this plugin?
Most "Send to Email" plugins use the `mailto:` protocol, which is limited to plain text and has very short character limits. This plugin uses the **EML Draft Method**, which:
- **Preserves Images**: Automatically converts local Obsidian images into embedded attachments.
- **No Length Limits**: Handles massive notes effortlessly by generating a standard `.eml` file.
- **One-Click Experience**: Opens a new draft in your default email app with the Subject, Body, and Images already populated.

## Features
- 📧 **Direct Integration**: Opens your system's default email app (eM Client, Outlook, etc.).
- 🖼️ **Image Support**: Uses CID (Content-ID) embedding to ensure images appear inline.
- ⚡ **Three Ways to Trigger**:
  1. **Ribbon Icon**: Click the envelope in the left sidebar.
  2. **File Menu**: Right-click any note in the explorer and select "Send via Email".
  3. **Command Palette**: Search for "Send current note via email".

## How it Works
When triggered, the plugin:
1. Renders your Markdown note to HTML using Obsidian's internal engine.
2. Identifies all local images and converts them into MIME-encoded attachments.
3. Generates a temporary `.eml` file in your vault root.
4. Tells your OS to open the file, instantly creating a rich draft in your email app.
5. Automatically deletes the temporary draft file after 60 seconds.

## Installation

### Manual Installation
1. Download the latest release (`main.js`, `manifest.json`, `styles.css`).
2. Create a folder named `obsidian-send-to-email` in your vault's `.obsidian/plugins/` directory.
3. Copy the files into that folder.
4. Reload Obsidian and enable the plugin in **Settings** -> **Community Plugins**.

## Development
If you want to build the plugin yourself:
1. Clone the repo.
2. Run `npm install`.
3. Run `npm run build` to compile the TypeScript into the `dist/` folder.
