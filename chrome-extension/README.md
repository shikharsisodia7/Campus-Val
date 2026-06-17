# CampusVal — Chrome Extension

A lightweight launcher for the CampusVal SCU AI advising web app.

## What it does

- Toolbar button opens a small popup with quick links to Dashboard, Advisor, Voice Advisor, Planner, Courses, GPA, and Graduation Paths.
- "Open in side panel" docks CampusVal as a panel alongside any page (Chrome 114+).
- "Server" field at the bottom of the popup lets you point the extension at a custom deployment (your own Replit URL, your school's, etc.). The default points at the published CampusVal app.

## Install (unpacked)

1. Unzip `campusval-extension.zip` somewhere on your disk.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped `chrome-extension/` folder.
4. Pin the CampusVal icon from the puzzle menu for one-click access.

## Configure server URL

Click the toolbar icon → bottom field → paste your CampusVal server URL → press Tab. It's saved per Google profile via `chrome.storage.sync`.

## Notes

- The Voice Advisor needs microphone permission. Use **Open in new tab** (not the side panel embed) the first time so Chrome can grant mic access to the site; afterward it works in the side panel too.
- The extension does no tracking, makes no network calls of its own, and stores nothing except the server URL preference.
