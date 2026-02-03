// UUIDs must match the ESP32 Firmware
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

let device, server, service, characteristic;

// UI Elements
const connectBtn = document.getElementById('connect-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const controlPanel = document.getElementById('control-panel');
const logOutput = document.getElementById('log-output');

const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnStop = document.getElementById('btn-stop');

// Logger
function log(msg) {
    const time = new Date().toLocaleTimeString();
    logOutput.innerHTML = `<div>[${time}] ${msg}</div>` + logOutput.innerHTML;
}

// Bluetooth Connection
connectBtn.addEventListener('click', async () => {
    try {
        log('Requesting Bluetooth Device...');
        device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [SERVICE_UUID] }]
        });

        device.addEventListener('gattserverdisconnected', onDisconnected);

        log('Connecting to GATT Server...');
        server = await device.gatt.connect();

        log('Getting Service...');
        service = await server.getPrimaryService(SERVICE_UUID);

        log('Getting Characteristic...');
        characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

        log('Connected!');
        setConnectedState(true);

    } catch (error) {
        log('Connection failed: ' + error);
        console.error(error);
    }
});

function onDisconnected(event) {
    log('Device disconnected.');
    setConnectedState(false);
}

function setConnectedState(isConnected) {
    if (isConnected) {
        statusDot.classList.add('connected');
        statusDot.classList.remove('disconnected');
        statusText.textContent = "Connected to Silent Compass";
        controlPanel.classList.remove('disabled');
        connectBtn.textContent = "Disconnect";
        connectBtn.onclick = () => device.gatt.disconnect();
    } else {
        statusDot.classList.add('disconnected');
        statusDot.classList.remove('connected');
        statusText.textContent = "Disconnected";
        controlPanel.classList.add('disabled');
        connectBtn.textContent = "Connect Device";
        connectBtn.onclick = null; // Revert to listener
        // Reload page to reset listener simply or just re-add in a real app
        // For simplicity, we just ask user to refresh or handle it better in v2
    }
}

// Command Sending
async function sendCommand(cmd) {
    if (!characteristic) {
        log('Not connected!');
        return;
    }
    try {
        const encoder = new TextEncoder();
        await characteristic.writeValue(encoder.encode(cmd));
        log(`Sent Command: ${cmd}`);
    } catch (error) {
        log('Send failed: ' + error);
    }
}

// Button Listeners
btnLeft.addEventListener('click', () => sendCommand('L'));
btnRight.addEventListener('click', () => sendCommand('R'));
btnStop.addEventListener('click', () => sendCommand('S'));

// --- SIMULATION MODE (For non-hardware demos) ---
const demoBtn = document.getElementById('demo-btn');
let isDemoMode = false;

demoBtn.addEventListener('click', () => {
    isDemoMode = true;
    log('--- STARTING SIMULATION MODE ---');
    log('Virtual Device Connected.');
    setConnectedState(true);
    statusText.textContent = "Connected (Simulation)";
    statusDot.style.backgroundColor = "cyan";
    statusDot.style.boxShadow = "0 0 8px cyan";

    // Hide the connect/demo buttons to clean UI
    connectBtn.style.display = 'none';
    demoBtn.style.display = 'none';
});

// Override sendCommand to handle Demo Mode
const originalSendCommand = sendCommand; // Keep ref to real one if needed mixed (not needed here)
// Redefining the function for the scope (simpler than hooking)
async function sendCommand(cmd) {
    // 1. If in Demo Mode, just log and fake it
    if (isDemoMode) {
        log(`[SIM] Sent Command: ${cmd}`);
        if (cmd === 'L') {
            btnLeft.style.backgroundColor = "rgba(255, 123, 114, 0.5)";
            setTimeout(() => btnLeft.style.backgroundColor = "", 200);
            // Vibrate the phone itself if supported!
            if (navigator.vibrate) navigator.vibrate(200);
        }
        if (cmd === 'R') {
            btnRight.style.backgroundColor = "rgba(63, 185, 80, 0.5)";
            setTimeout(() => btnRight.style.backgroundColor = "", 200);
            if (navigator.vibrate) navigator.vibrate(200);
        }
        return;
    }

    // 2. Real Bluetooth Mode
    if (!characteristic) {
        log('Not connected!');
        return;
    }
    try {
        const encoder = new TextEncoder();
        await characteristic.writeValue(encoder.encode(cmd));
        log(`Sent Command: ${cmd}`);
    } catch (error) {
        log('Send failed: ' + error);
    }
}
