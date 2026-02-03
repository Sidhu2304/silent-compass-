# Deployment Guide

This guide explains how to run the **Web Controller** on your phone.

## Option 1: Run Locally (Fastest)

Since Web Bluetooth requires a secure context (HTTPS) or localhost, simply opening the file on your phone might not work unless you use a cable.

### The "VS Code Live Server" Method
1. Install the "Live Server" extension in VS Code.
2. Right-click `index.html` -> "Open with Live Server".
3. It will open in your browser at `http://127.0.0.1:5500`.
4. To view on your phone physically:
    *   Connect phone to same WiFi as laptop.
    *   Find your laptop's IP address (e.g., `192.168.1.5`).
    *   Open `http://192.168.1.5:5500` on your phone.
    *   *Note: Chrome might block Bluetooth on non-HTTPS/localhost. If so, use Option 2.*

## Option 2: GitHub Pages (Recommended)

Host it for free on the internet!

### Direct Links
*   **Repo Settings**: [Click Here to Configure Pages](https://github.com/Sidhu2304/silent-compass-/settings/pages)
*   **Main Repo**: [https://github.com/Sidhu2304/silent-compass-](https://github.com/Sidhu2304/silent-compass-)

### Steps to Activate
1.  Click the **Repo Settings** link above.
2.  Under **Build and deployment**, select **Source** -> `Deploy from a branch`.
3.  Select Branch: **`main`** and Folder: **`/ (root)`**.
4.  Click **Save**.
5.  Wait 1 minute, then refresh the page. You will see your live link!

## Quick Demo (Simulation Mode)
I have added a **"Simulation Mode"** button to the app.
If you don't have the hardware with you, you can still show the UI:
1.  Click "Run Simulation Mode".
2.  The UI will say "Connected (Simulation)".
3.  Pressing Left/Right will flash the buttons and vibrate your phone (if supported)!
