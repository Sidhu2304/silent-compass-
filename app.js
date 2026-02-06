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

// --- GUIDANCE MODAL FUNCTIONS ---
function showGuidance() {
    document.getElementById('guidance-modal').style.display = 'block';
    log('Opening help guide...');
}

function closeGuidance() {
    document.getElementById('guidance-modal').style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('guidance-modal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

// Show guidance on first visit
if (!localStorage.getItem('silentCompassVisited')) {
    setTimeout(() => {
        showGuidance();
        localStorage.setItem('silentCompassVisited', 'true');
    }, 1000);
}

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
// --- AUTOMATED NAVIGATION LOGIC ---
const mapElement = document.getElementById('map');
const confirmPanel = document.getElementById('confirmation-panel');
const routeInfo = document.getElementById('route-info');
const startNavBtn = document.getElementById('start-nav-btn');

let map, userMarker, routingControl;
let currentHeading = 0;
let nextStepBearing = null;
let navigationActive = false;

// Speak Helper
function speak(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
    }
}

// 1. Initialize Map
function initMap() {
    if (!navigator.geolocation) {
        log("Geolocation is not supported.");
        return;
    }
    mapElement.style.display = 'block';

    map = L.map('map').setView([0, 0], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Allow setting destination by clicking map (Moved outside watchPosition)
    map.on('click', function (e) {
        if (userMarker) {
            const pos = userMarker.getLatLng();
            setDestination(pos.lat, pos.lng, e.latlng.lat, e.latlng.lng);
        } else {
            speak("Waiting for G P S lock.");
            log("Waiting for GPS lock...");
        }
    });

    // 2. Track GPS Position
    navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            if (!userMarker) {
                userMarker = L.marker([lat, lng]).addTo(map).bindPopup("You").openPopup();
                map.setView([lat, lng], 16);
                speak("G P S Connected.");
            } else {
                userMarker.setLatLng([lat, lng]);
            }
        },
        (err) => log("GPS Error: " + err.message),
        { enableHighAccuracy: true }
    );

    // 3. Track Compass Heading
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', (event) => {
            if (event.alpha) currentHeading = 360 - event.alpha;
        });
    }
}

// 4. Calculate Route (With Search)
function setDestination(startLat, startLng, destLat, destLng) {
    if (routingControl) {
        map.removeControl(routingControl);
    }

    // Stop any current nav
    navigationActive = false;
    confirmPanel.style.display = 'none';

    log("Calculating Route...");
    speak("Calculating route...");

    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(startLat, startLng),
            L.latLng(destLat, destLng)
        ],
        routeWhileDragging: false,
        geocoder: L.Control.Geocoder.nominatim(), // Adds Search Bar
        show: true, // Show the panel so they can see/search
    }).on('routesfound', function (e) {
        const routes = e.routes;
        const summary = routes[0].summary;
        const distKm = (summary.totalDistance / 1000).toFixed(1);
        const timeMin = Math.round(summary.totalTime / 60);

        log(`Route: ${distKm} km, ${timeMin} min`);

        // Show Confirmation
        confirmPanel.style.display = 'block';
        routeInfo.textContent = `Destination Found: ${distKm} km (${timeMin} min).`;
        speak(`Route found. Distance is ${distKm} kilometers. Press Start Guidance to begin.`);

        // Setup Start Button
        startNavBtn.onclick = () => {
            navigationActive = true;
            confirmPanel.style.display = 'none';
            speak("Starting Navigation. Walk forward.");

            // Get first instruction
            if (routes[0].instructions.length > 0) {
                const nextPoint = routes[0].coordinates[1];
                nextStepBearing = calculateBearing(startLat, startLng, nextPoint.lat, nextPoint.lng);
            }
        };

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

    let delta = nextStepBearing - currentHeading;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    if (delta > 20) {
        log(`[AUTO] Turn RIGHT (${parseInt(delta)}°)`);
        speak("Turn Right"); // Audio feedback too
        sendCommand('R');
    } else if (delta < -20) {
        log(`[AUTO] Turn LEFT (${parseInt(delta)}°)`);
        speak("Turn Left");
        sendCommand('L');
    } else {
        // sendCommand('S');
    }
}, 3000); // Check every 3s to be less annoying

setTimeout(initMap, 1000);
