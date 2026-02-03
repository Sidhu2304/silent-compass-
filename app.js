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
    } catch (error) {
        log('Send failed: ' + error);
    }
}

// --- AUTOMATED NAVIGATION LOGIC ---
const mapElement = document.getElementById('map');
let map, userMarker, routingControl;
let currentHeading = 0;
let nextStepBearing = null;
let navigationActive = false;

// 1. Initialize Map
function initMap() {
    if (!navigator.geolocation) {
        log("Geolocation is not supported.");
        return;
    }
    mapElement.style.display = 'block';
    // Center initially (will be updated by GPS)
    map = L.map('map').setView([0, 0], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // 2. Track GPS Position
    navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            if (!userMarker) {
                userMarker = L.marker([lat, lng]).addTo(map).bindPopup("You").openPopup();
                map.setView([lat, lng], 16);
            } else {
                userMarker.setLatLng([lat, lng]);
            }

            // Allow setting destination by clicking map
            map.on('click', function (e) {
                setDestination(lat, lng, e.latlng.lat, e.latlng.lng);
            });
        },
        (err) => log("GPS Error: " + err.message),
        { enableHighAccuracy: true }
    );

    // 3. Track Compass Heading
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', (event) => {
            if (event.alpha) {
                // Invert alpha for standard compass heading (0 = North)
                // Note: This varies by device/browser. Simplified for demo.
                currentHeading = 360 - event.alpha;
            }
        });
    }
}

// 4. Calculate Route
function setDestination(startLat, startLng, destLat, destLng) {
    if (routingControl) {
        map.removeControl(routingControl);
    }

    log("Calculating Route...");

    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(startLat, startLng),
            L.latLng(destLat, destLng)
        ],
        routeWhileDragging: false,
        show: false, // Hide the default panel to keep UI clean
    }).on('routesfound', function (e) {
        const routes = e.routes;
        const summary = routes[0].summary;
        log(`Route found: ${(summary.totalDistance / 1000).toFixed(1)} km`);

        // Start Guidance
        navigationActive = true;
        // Get the first instruction step
        if (routes[0].instructions.length > 0) {
            // Simplified: Aim for the *end* of the first segment for bearing
            const nextPoint = routes[0].coordinates[1]; // approximate
            nextStepBearing = calculateBearing(startLat, startLng, nextPoint.lat, nextPoint.lng);
            log(`Target Bearing: ${parseInt(nextStepBearing)}°`);
        }
    }).addTo(map);
}

// 5. Helper: Calculate Bearing between two points
function calculateBearing(startLat, startLng, destLat, destLng) {
    const startLatRad = toRadians(startLat);
    const startLngRad = toRadians(startLng);
    const destLatRad = toRadians(destLat);
    const destLngRad = toRadians(destLng);

    const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
    const x = Math.cos(startLatRad) * Math.sin(destLatRad) -
        Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
    let brng = Math.atan2(y, x);
    brng = toDegrees(brng);
    return (brng + 360) % 360;
}

function toRadians(deg) { return deg * (Math.PI / 180); }
function toDegrees(rad) { return rad * (180 / Math.PI); }

// 6. Guidance Loop (Runs every 2 seconds)
setInterval(() => {
    if (!navigationActive || nextStepBearing === null) return;

    // Calculate Deviation
    let delta = nextStepBearing - currentHeading;
    // Normalize to -180 to +180
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    // Dead Zone: +/- 20 degrees is "Straight"
    if (delta > 20) {
        log(`[AUTO] Turn RIGHT (${parseInt(delta)}°)`);
        sendCommand('R');
    } else if (delta < -20) {
        log(`[AUTO] Turn LEFT (${parseInt(delta)}°)`);
        sendCommand('L');
    } else {
        // On course - silence or heartbeat pulse
        // sendCommand('S'); // Optional: ensure motors off
    }
}, 2000);

setTimeout(initMap, 1000);
