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

// --- NEW FEATURES UI ---
const micBtn = document.getElementById('mic-btn');
const voiceStatus = document.getElementById('voice-status');
const guardianBtn = document.getElementById('guardian-btn');


// Logger
function log(msg) {
    const time = new Date().toLocaleTimeString();
    logOutput.innerHTML = `<div>[${time}] ${msg}</div>` + logOutput.innerHTML;
}

// Bluetooth Connection
// Bluetooth Connection
connectBtn.addEventListener('click', async () => {
    // 1. Check if Browser Supports Bluetooth
    if (!navigator.bluetooth) {
        alert("Your browser does not support Bluetooth!\nPlease use Google Chrome, Edge, or Opera on Desktop/Android.\n\n(iOS does not support Web Bluetooth in standard browsers).");
        log("Error: Web Bluetooth API not available.");
        return;
    }

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

        // Show user-friendly error
        if (error.toString().includes("User cancelled")) {
            // Provide a hint if they cancelled
            // fail silently or log
        } else {
            alert("Connection Failed!\n\n1. Make sure Bluetooth is ON.\n2. Make sure the ESP32 is powered ON.\n3. Make sure 'Silent Compass' shows up in the list.\n\nError: " + error);
        }
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
window.onclick = function (event) {
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
let navigationActive = false;
let currentRoute = null;
let lastInstructionIndex = 0;

// Risky Areas (Simulated for Demo)
// In a real app, these would come from an API or map data
const riskyAreas = [
    { lat: 0, lng: 0, radius: 20 }, // Placeholder, will update on click
];

// Speak Helper
function speak(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
    }
}

// 1. Initialize Map
// 1. Initialize Map
function initMap() {
    // Check if Leaflet loaded
    if (typeof L === 'undefined') {
        alert("Error: Map library did not load.\nPlease check your internet connection.");
        log("Error: Leaflet (L) not found.");
        return;
    }

    // Always show map container
    mapElement.style.display = 'block';

    try {
        // Default View (World)
        map = L.map('map').setView([0, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        // Click Listener
        map.on('click', function (e) {
            // Shift-click to add a "Risky Area" for testing
            if (e.originalEvent.shiftKey) {
                riskyAreas.push({ lat: e.latlng.lat, lng: e.latlng.lng, radius: 20 });
                L.circle([e.latlng.lat, e.latlng.lng], { color: 'red', radius: 20 }).addTo(map);
                log("Added Risky Area at clicked path!");
                speak("Risky area added.");
                return;
            }

            if (userMarker) {
                const pos = userMarker.getLatLng();
                setDestination(pos.lat, pos.lng, e.latlng.lat, e.latlng.lng);
            } else {
                speak("Waiting for G P S lock.");
                log("Waiting for GPS lock...");
            }
        });

        // Try Geolocation
        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;

                    if (!userMarker) {
                        userMarker = L.marker([lat, lng]).addTo(map).bindPopup("You").openPopup();
                        map.setView([lat, lng], 16);
                        speak("G P S Connected.");
                        log("GPS Location Found.");
                    } else {
                        userMarker.setLatLng([lat, lng]);
                    }
                },
                (err) => {
                    log("GPS Error: " + err.message);
                    alert("GPS Error: " + err.message + "\nEnsure Location is allowed.");
                },
                { enableHighAccuracy: true }
            );
        } else {
            log("Geolocation API not supported.");
        }

        // track heading
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (event) => {
                if (event.alpha) currentHeading = 360 - event.alpha;
            });
        }

    } catch (e) {
        log("Map Init Error: " + e);
        alert("Map Error: " + e);
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
        currentRoute = routes[0]; // Store the route for step-by-step nav
        const summary = currentRoute.summary;
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
            lastInstructionIndex = 0;
            confirmPanel.style.display = 'none';
            speak("Starting Navigation. Walk forward.");

            // Initial instruction
            handleNavigationStep(userMarker.getLatLng());
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

// 6. Robust Navigation Loop (Runs every 2 seconds)
setInterval(() => {
    if (!navigationActive || !userMarker) return;

    const userPos = userMarker.getLatLng();

    // A. Check for Risky Areas
    checkRiskyAreas(userPos);

    // B. Check Navigation Instructions
    handleNavigationStep(userPos);

}, 2500);

// --- NEW NAVIGATION LOGIC ---

function checkRiskyAreas(userPos) {
    let inDanger = false;
    for (let area of riskyAreas) {
        const dist = map.distance(userPos, [area.lat, area.lng]);
        if (dist < area.radius) {
            inDanger = true;
            break;
        }
    }

    if (inDanger) {
        log("[ALERT] Entering Risky Area!");
        speak("Warning. Risky Area.");
        sendCommand('W'); // Trigger Warning Vibration

        // Visual Alert
        const alertOverlay = document.createElement('div');
        alertOverlay.className = 'risky-alert';
        document.body.appendChild(alertOverlay);
        setTimeout(() => alertOverlay.remove(), 3000);
    }
}

function handleNavigationStep(userPos) {
    if (!currentRoute || !currentRoute.instructions) return;

    // Find the next instruction we haven't passed yet
    // Simple logic: find closest instruction point ahead
    const instructions = currentRoute.instructions;

    // Safety check
    if (lastInstructionIndex >= instructions.length) {
        log("Arrived at destination!");
        speak("You have arrived.");
        navigationActive = false;
        sendCommand('C'); // A success Pattern
        return;
    }

    const nextStep = instructions[lastInstructionIndex];
    // OSRM instructions usually have an index into the coordinates array
    // We need to look at the *next* major turn

    // For simplicity in this demo, we look at the next coordinate in the route path
    // verifying if we are close to a turn. 
    // real OSRM matching is complex, so we use the instruction's type and distance

    // Let's rely on the instruction's text and type
    // If distance to the next turn point is < 30m, warn the user

    // We can also just calculate bearing to the *final destination* of this step
    // But better: Calculate bearing to the *immediate next coordinate* in the polyline
    // to keep them on the path.

    // ... Simplified Logic for "Turn-by-Turn" ...
    // 1. Get current instruction
    const instr = instructions[lastInstructionIndex];

    // 2. Check distance to this instruction's end point? 
    // Actually, instructions[i] describes the segment *after* the turn usually.
    // Let's look at route coordinates.
    // We will simply point them to the next significant coordinate.

    // Find the closest point on the route to snap the user?
    // Optimization: Just calculate bearing to the point 10 meters ahead in the route.

    // --- ACTUAL IMPLEMENTATION FOR DEMO ---
    // We will look at the instruction. If it says "Turn Right" and we are close, vibrate.

    // Let's assume the user is moving. We check the *next* instruction.
    // If we are within 20 meters of the next instruction's coordinate (which is usually the turn point)

    // Note: Leaflet Routing Machine implementation details vary. 
    // instructions[i].index is the index in the coordinates array.

    // Look ahead to the NEXT instruction (the turn)
    if (lastInstructionIndex + 1 < instructions.length) {
        const nextInstr = instructions[lastInstructionIndex + 1];
        const turnIndex = nextInstr.index;
        const turnPoint = currentRoute.coordinates[turnIndex];

        const distToTurn = map.distance(userPos, turnPoint);

        if (distToTurn < 25) { // Within 25 meters of the turn
            const turnType = nextInstr.type; // 'Right', 'Left', etc.
            const text = nextInstr.text || "";

            // Check if we already handled this index? No, we just repeat until we pass it.
            // How do we know we passed it?
            // If distance starts increasing OR we are very close (< 5m).

            if (distToTurn < 8) {
                // We are AT the turn.
                log(`[NAV] At turn: ${text}`);
                lastInstructionIndex++; // Advance to next segment
                speak(text);
                return;
            }

            // We are APPROACHING the turn -> Give feedback
            if (text.toLowerCase().includes('right') || nextInstr.type === 'TurnRight') {
                log(`[NAV] Approaching Right Turn (${Math.round(distToTurn)}m)`);
                sendCommand('R');
            } else if (text.toLowerCase().includes('left') || nextInstr.type === 'TurnLeft') {
                log(`[NAV] Approaching Left Turn (${Math.round(distToTurn)}m)`);
                sendCommand('L');
            }
            return;
        }
    }

    // If not near a turn, just keep them straight?
    // Or guide them to the path?
    // For now, "Silence" means "Go Straight".
}

// Global Error Handler
window.onerror = function (message, source, lineno, colno, error) {
    alert("App Error: " + message);
    if (logOutput) log("Script Error: " + message);
};

// Start
setTimeout(initMap, 1000); // Existing map init

// --- VOICE CONTROL IMPLEMENTATION ---
let recognition;

if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';

    recognition.onstart = function () {
        micBtn.classList.add('listening');
        voiceStatus.textContent = "Listening...";
        voiceStatus.classList.add('visible');
    };

    recognition.onend = function () {
        micBtn.classList.remove('listening');
        voiceStatus.classList.remove('visible');
    };

    recognition.onresult = function (event) {
        const transcript = event.results[0][0].transcript.toLowerCase();
        log(`Voice: "${transcript}"`);
        voiceStatus.textContent = `"${transcript}"`;
        voiceStatus.classList.add('visible');
        setTimeout(() => voiceStatus.classList.remove('visible'), 3000);

        handleVoiceCommand(transcript);
    };

    micBtn.addEventListener('click', () => {
        try {
            recognition.start();
            speak("Listening.");
        } catch (e) {
            log("Mic Error: " + e);
        }
    });
} else {
    micBtn.style.display = 'none';
    log("Web Speech API not supported.");
}

function handleVoiceCommand(text) {
    if (text.includes("take me to")) {
        const destination = text.replace("take me to", "").trim();
        if (destination.length > 0) {
            log(`Searching for: ${destination}`);
            speak(`Searching for ${destination}`);
            searchAndRoute(destination);
        }
    } else if (text.includes("stop")) {
        sendCommand('S');
        speak("Stopping.");
    } else if (text.includes("where am i")) {
        if (userMarker) {
            speak("You are currently located on the map.");
            // Reverse geocoding could go here
        }
    }
}

function searchAndRoute(query) {
    // LEAFLET GEOCODER SEARCH
    if (!L.Control.Geocoder) return;

    const geocoder = L.Control.Geocoder.nominatim();
    geocoder.geocode(query, function (results) {
        if (results && results.length > 0) {
            const result = results[0];
            const destLat = result.center.lat;
            const destLng = result.center.lng;

            log(`Found: ${result.name}`);
            speak(`Found ${result.name}. Calculating route.`);

            if (userMarker) {
                const userPos = userMarker.getLatLng();
                setDestination(userPos.lat, userPos.lng, destLat, destLng);
            } else {
                speak("Waiting for GPS location.");
            }
        } else {
            speak("Destination not found. Please try again.");
        }
    });
}

// --- GUARDIAN FEATURE ---
guardianBtn.addEventListener('click', () => {
    if (!userMarker) {
        alert("GPS Location not found yet!");
        return;
    }
    const pos = userMarker.getLatLng();
    const mapLink = `https://www.google.com/maps/search/?api=1&query=${pos.lat},${pos.lng}`;
    const msg = `Help! I am here: ${mapLink}`;

    // Open WhatsApp
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(whatsappUrl, '_blank');
});

