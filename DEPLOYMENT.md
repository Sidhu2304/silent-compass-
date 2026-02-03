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

1.  Create a new Repository on GitHub (e.g., `silent-compass-app`).
2.  Upload `index.html`, `style.css`, and `app.js`.
3.  Go to **Settings** -> **Pages**.
4.  Select `main` branch and click **Save**.
5.  GitHub will give you a link (e.g., `https://yourname.github.io/silent-compass-app`).
6.  Open that link on **ANY** phone (Android/iOS) or Laptop.
7.  It will work perfectly with potential HTTPS requirements met automatically.

## Quick Demo (Simulation Mode)
I have added a **"Simulation Mode"** button to the app.
If you don't have the hardware with you, you can still show the UI:
1.  Click "Run Simulation Mode".
2.  The UI will say "Connected (Simulation)".
3.  Pressing Left/Right will flash the buttons and vibrate your phone (if supported)!
