// ============================================================
// SILENT COMPASS — app.js (v2.0 — Fixed & Enhanced)
// ============================================================

// --- BLE CONFIGURATION ---
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

let device, server, service, characteristic;
let isDemoMode = false;

// --- STATE ---
let map, userMarker, routingControl, destinationPoint;
let currentHeading = 0;
let navigationActive = false;
let currentRoute = null;
let lastInstructionIndex = 0;
let lastSpokenInstruction = '';
let posBuffer = [];           // GPS smoothing buffer
let lastPos = null;           // For GPS-derived heading
let navInterval = null;

// --- OSM TAG MAP ---
const osmTagMap = {
    'Banks':      ['amenity', 'bank'],
    'ATMs':       ['amenity', 'atm'],
    'Health':     ['amenity', 'hospital'],
    'Pharmacy':   ['amenity', 'pharmacy'],
    'Food':       ['amenity', 'restaurant'],
    'Cafe':       ['amenity', 'cafe'],
    'Transport':  ['highway', 'bus_stop'],
    'Education':  ['amenity', 'school'],
    'Stores':     ['shop', 'supermarket'],
    'Public':     ['amenity', 'toilets'],
    'Lodging':    ['tourism', 'hotel'],
    'Pubs':       ['amenity', 'bar'],
    'Arts':       ['tourism', 'museum'],
    'Police':     ['amenity', 'police'],
    'Fuel':       ['amenity', 'fuel'],
};

// --- UI ELEMENTS ---
const connectBtn       = document.getElementById('connect-btn');
const statusDot        = document.getElementById('status-dot');
const statusText       = document.getElementById('status-text');
const controlPanel     = document.getElementById('control-panel');
const logOutput        = document.getElementById('log-output');
const btnLeft          = document.getElementById('btn-left');
const btnRight         = document.getElementById('btn-right');
const btnStop          = document.getElementById('btn-stop');
const micBtn           = document.getElementById('mic-btn');
const voiceStatus      = document.getElementById('voice-status');
const guardianBtn      = document.getElementById('guardian-btn');
const demoBtn          = document.getElementById('demo-btn');
const resultsView      = document.getElementById('results-view');
const categoryGrid     = document.getElementById('category-grid');
const resultsList      = document.getElementById('results-list');
const resultsTitle     = document.getElementById('results-title');
const loadingSpinner   = document.getElementById('loading-spinner');
const confirmPanel     = document.getElementById('confirmation-panel');
const routeInfo        = document.getElementById('route-info');
const startNavBtn      = document.getElementById('start-nav-btn');

// ============================================================
// LOGGER
// ============================================================
function log(msg) {
    if (!logOutput) return;
    const time = new Date().toLocaleTimeString();
    logOutput.innerHTML = `<div>[${time}] ${msg}</div>` + logOutput.innerHTML;
}

// ============================================================
// SPEAK HELPER
// ============================================================
function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Prevent overlap
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
    }
}

// ============================================================
// TAB SWITCHING
// ============================================================
window.switchTab = function (tabId, btnElement) {
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    if (btnElement) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        btnElement.classList.add('active');
    }

    if (tabId === 'view-map' && map) {
        setTimeout(() => map.invalidateSize(), 100);
    }
};

// ============================================================
// BLUETOOTH — FIX: Single clean handler, proper reconnect
// ============================================================
async function connectHandler() {
    if (!navigator.bluetooth) {
        alert("Web Bluetooth not supported.\nUse Chrome on Android or Desktop.\niOS is not supported.");
        log("Error: Web Bluetooth API not available.");
        return;
    }
    try {
        log('Requesting Bluetooth device...');
        device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [SERVICE_UUID] }]
        });
        device.addEventListener('gattserverdisconnected', onDisconnected);

        log('Connecting to GATT Server...');
        server = await device.gatt.connect();
        service = await server.getPrimaryService(SERVICE_UUID);
        characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

        log('✓ Connected to device!');
        speak("Device connected.");
        setConnectedState(true);
    } catch (error) {
        if (!error.toString().includes("User cancelled")) {
            log('Connection failed: ' + error);
            alert("Connection Failed.\n\n• Turn Bluetooth ON\n• Power on the ESP32\n• 'Silent Compass' must appear in list\n\n" + error);
        }
    }
}

connectBtn.addEventListener('click', connectHandler);

function onDisconnected() {
    log('Device disconnected.');
    speak("Device disconnected.");
    characteristic = null;
    setConnectedState(false);
}

function setConnectedState(isConnected) {
    if (isConnected) {
        statusDot.className = 'status-indicator connected';
        statusText.textContent = isDemoMode ? "Connected (Simulation)" : "Connected to Silent Compass";
        controlPanel.classList.remove('disabled');
        connectBtn.textContent = "Disconnect";
        connectBtn.onclick = () => { device && device.gatt.disconnect(); };
    } else {
        statusDot.className = 'status-indicator disconnected';
        statusText.textContent = "Disconnected";
        controlPanel.classList.add('disabled');
        connectBtn.textContent = "Connect Device";
        connectBtn.onclick = connectHandler;  // FIX: always re-attach handler
    }
}

// ============================================================
// COMMAND SENDING — FIX: Single unified function
// ============================================================
async function sendCommand(cmd) {
    // Demo Mode
    if (isDemoMode) {
        log(`[SIM] Command: ${cmd}`);
        const flashMap = { 'L': btnLeft, 'R': btnRight, 'S': btnStop };
        const btn = flashMap[cmd];
        if (btn) {
            btn.style.opacity = '0.4';
            setTimeout(() => btn.style.opacity = '1', 250);
        }
        if (navigator.vibrate) {
            const patterns = {
                'L': [200, 100, 200],
                'R': [300],
                'F': [100],
                'A': [200, 100, 200, 100, 500],
                'W': [100, 50, 100, 50, 100],
                'S': [50]
            };
            navigator.vibrate(patterns[cmd] || [200]);
        }
        return;
    }

    // Real BLE Mode
    if (!characteristic) {
        log('Not connected to device.');
        return;
    }
    try {
        const encoder = new TextEncoder();
        await characteristic.writeValue(encoder.encode(cmd));
        log(`Sent: ${cmd}`);
    } catch (error) {
        log('Send failed: ' + error);
    }
}

// Button Listeners
btnLeft.addEventListener('click',  () => sendCommand('L'));
btnRight.addEventListener('click', () => sendCommand('R'));
btnStop.addEventListener('click',  () => { sendCommand('S'); navigationActive = false; });

// ============================================================
// DEMO MODE — FIX: Cleaner setup
// ============================================================
demoBtn.addEventListener('click', () => {
    isDemoMode = true;
    setConnectedState(true);
    connectBtn.style.display = 'none';
    demoBtn.style.display = 'none';
    log('Simulation mode started.');
    speak("Simulation mode active.");
});

// ============================================================
// GPS SMOOTHING
// ============================================================
function smoothedPosition(lat, lng) {
    posBuffer.push({ lat, lng });
    if (posBuffer.length > 5) posBuffer.shift();
    const avg = posBuffer.reduce(
        (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
        { lat: 0, lng: 0 }
    );
    return { lat: avg.lat / posBuffer.length, lng: avg.lng / posBuffer.length };
}

// ============================================================
// MAP INIT
// ============================================================
function initMap() {
    if (typeof L === 'undefined') {
        log("Error: Leaflet library not loaded.");
        return;
    }

    try {
        map = L.map('map').setView([20.5937, 78.9629], 5); // India default
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        // Map click → set destination
        map.on('click', function (e) {
            if (e.originalEvent.shiftKey) {
                L.circle([e.latlng.lat, e.latlng.lng], { color: 'red', radius: 20, fillOpacity: 0.4 }).addTo(map);
                log("Risky area marked.");
                speak("Risky area added.");
                return;
            }
            if (userMarker) {
                const pos = userMarker.getLatLng();
                setDestination(pos.lat, pos.lng, e.latlng.lat, e.latlng.lng);
            } else {
                speak("Waiting for GPS lock.");
            }
        });

        // GPS tracking
        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                (position) => {
                    const raw = { lat: position.coords.latitude, lng: position.coords.longitude };
                    const smooth = smoothedPosition(raw.lat, raw.lng);

                    // GPS-derived heading (more reliable than compass)
                    if (lastPos) {
                        currentHeading = calculateBearing(lastPos.lat, lastPos.lng, smooth.lat, smooth.lng);
                    }
                    lastPos = smooth;

                    if (!userMarker) {
                        userMarker = L.marker([smooth.lat, smooth.lng])
                            .addTo(map)
                            .bindPopup("📍 You are here")
                            .openPopup();
                        map.setView([smooth.lat, smooth.lng], 17);
                        speak("GPS connected.");
                        log("GPS location found.");
                        updateLocationBanner(smooth.lat, smooth.lng);
                    } else {
                        userMarker.setLatLng([smooth.lat, smooth.lng]);
                    }
                },
                (err) => {
                    log("GPS Error: " + err.message);
                },
                { enableHighAccuracy: true, maximumAge: 1000 }
            );
        }

        // Device orientation (fallback compass)
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (event) => {
                if (event.alpha && !lastPos) {
                    currentHeading = 360 - event.alpha;
                }
            });
        }

    } catch (e) {
        log("Map init error: " + e);
    }
}

// ============================================================
// REVERSE GEOCODING — Update location banner
// ============================================================
async function updateLocationBanner(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
        const res  = await fetch(url);
        const data = await res.json();
        const addr = data.address;
        const label = addr.road || addr.suburb || addr.city || "Current Location";
        const city  = addr.city || addr.town || addr.state || '';
        const banner = document.getElementById('banner-location');
        const bannerSub = document.getElementById('banner-sublocation');
        if (banner) banner.textContent = label;
        if (bannerSub) bannerSub.textContent = city;
    } catch (e) {
        log("Reverse geocode error: " + e);
    }
}

// ============================================================
// ROUTE CALCULATION
// ============================================================
function setDestination(startLat, startLng, destLat, destLng) {
    if (routingControl) map.removeControl(routingControl);

    // FIX: Always reset state for new route
    navigationActive = false;
    lastInstructionIndex = 0;
    lastSpokenInstruction = '';
    destinationPoint = L.latLng(destLat, destLng);
    confirmPanel.style.display = 'none';

    log("Calculating route...");
    speak("Calculating route.");

    routingControl = L.Routing.control({
        waypoints: [L.latLng(startLat, startLng), L.latLng(destLat, destLng)],
        routeWhileDragging: false,
        showAlternatives: false,
        lineOptions: { styles: [{ color: '#2fbad3', weight: 5 }] },
        createMarker: () => null, // Use our own markers
    }).on('routesfound', function (e) {
        currentRoute = e.routes[0];
        const dist = (currentRoute.summary.totalDistance / 1000).toFixed(1);
        const time = Math.round(currentRoute.summary.totalTime / 60);

        log(`Route found: ${dist} km, ~${time} min`);
        confirmPanel.style.display = 'block';
        routeInfo.textContent = `${dist} km · ${time} min walk`;
        speak(`Route found. ${dist} kilometers, about ${time} minutes. Press Start to begin.`);

        startNavBtn.onclick = () => {
            navigationActive = true;
            lastInstructionIndex = 0;
            confirmPanel.style.display = 'none';
            speak("Navigation started. Walk forward.");
            log("Navigation active.");
            startNavLoop();
        };
    }).on('routingerror', function (e) {
        log("Routing error: " + e.error.message);
        speak("Could not find a route. Please try a different destination.");
    }).addTo(map);
}

// ============================================================
// NAVIGATION LOOP — Runs every 2s when active
// ============================================================
function startNavLoop() {
    if (navInterval) clearInterval(navInterval);
    navInterval = setInterval(() => {
        if (!navigationActive || !userMarker || !currentRoute) return;

        const userPos = userMarker.getLatLng();

        // 1. Check arrival
        if (destinationPoint) {
            const distToDest = map.distance(userPos, destinationPoint);
            if (distToDest < 15) {
                speak("You have arrived at your destination.");
                log("✓ Arrived!");
                sendCommand('A');
                if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
                navigationActive = false;
                clearInterval(navInterval);
                return;
            }
            // Announce distance every 100m
            announceDistanceIfNeeded(distToDest);
        }

        // 2. Check off-route (> 40m from route)
        checkOffRoute(userPos);

        // 3. Turn-by-turn
        handleNavigationStep(userPos);

    }, 2000);
}

let lastAnnouncedDistance = Infinity;

function announceDistanceIfNeeded(dist) {
    const thresholds = [500, 300, 200, 100, 50];
    for (const t of thresholds) {
        if (dist < t + 10 && lastAnnouncedDistance > t + 10) {
            speak(`${t} meters to destination.`);
            lastAnnouncedDistance = dist;
            break;
        }
    }
}

function checkOffRoute(userPos) {
    if (!currentRoute || !currentRoute.coordinates) return;
    let minDist = Infinity;
    for (const coord of currentRoute.coordinates) {
        const d = map.distance(userPos, coord);
        if (d < minDist) minDist = d;
    }
    if (minDist > 40) {
        log("[NAV] Off route — recalculating...");
        speak("Off route. Recalculating.");
        const dest = currentRoute.waypoints[currentRoute.waypoints.length - 1];
        setDestination(userPos.lat, userPos.lng, dest.latLng.lat, dest.latLng.lng);
    }
}

function handleNavigationStep(userPos) {
    const instructions = currentRoute.instructions;
    if (!instructions || lastInstructionIndex >= instructions.length) return;

    // Look ahead to the next turn
    if (lastInstructionIndex + 1 < instructions.length) {
        const nextInstr = instructions[lastInstructionIndex + 1];
        const turnPoint = currentRoute.coordinates[nextInstr.index];
        if (!turnPoint) return;

        const distToTurn = map.distance(userPos, turnPoint);

        if (distToTurn < 8) {
            // AT the turn — advance
            lastInstructionIndex++;
            speak(nextInstr.text || "Continue.");
            log(`[NAV] Turn: ${nextInstr.text}`);
            return;
        }

        if (distToTurn < 30) {
            const text = (nextInstr.text || '').toLowerCase();
            const instrKey = nextInstr.type + '_' + lastInstructionIndex;

            if (instrKey !== lastSpokenInstruction) {
                lastSpokenInstruction = instrKey;

                if (text.includes('right') || nextInstr.type === 'TurnRight') {
                    log(`[NAV] Right turn in ${Math.round(distToTurn)}m`);
                    speak(`Turn right in ${Math.round(distToTurn)} meters.`);
                    sendCommand('R');
                } else if (text.includes('left') || nextInstr.type === 'TurnLeft') {
                    log(`[NAV] Left turn in ${Math.round(distToTurn)}m`);
                    speak(`Turn left in ${Math.round(distToTurn)} meters.`);
                    sendCommand('L');
                } else {
                    sendCommand('F');
                }
            }
        }
    }
}

// ============================================================
// BEARING CALCULATION
// ============================================================
function calculateBearing(lat1, lng1, lat2, lng2) {
    const toRad = d => d * Math.PI / 180;
    const toDeg = r => r * 180 / Math.PI;
    const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ============================================================
// NEARBY SEARCH — FIX: Overpass API (not Nominatim)
// ============================================================
window.findNearby = async function (categoryName, tagKey, tagValue) {
    if (!userMarker) {
        speak("Please wait for GPS lock first.");
        alert("GPS not found yet. Please wait for location lock.");
        return;
    }

    categoryGrid.style.display = 'none';
    resultsView.style.display = 'block';
    resultsList.innerHTML = '';
    loadingSpinner.style.display = 'block';
    resultsTitle.textContent = `${categoryName} Nearby`;
    speak(`Searching for ${categoryName} nearby.`);

    const userPos = userMarker.getLatLng();
    const radius = 2000; // 2km

    // Use tag from osmTagMap if not provided directly
    if (!tagKey) {
        const tag = osmTagMap[categoryName];
        if (tag) { tagKey = tag[0]; tagValue = tag[1]; }
        else      { tagKey = 'amenity'; tagValue = categoryName.toLowerCase(); }
    }

    const query = `
        [out:json][timeout:25];
        node["${tagKey}"="${tagValue}"](around:${radius},${userPos.lat},${userPos.lng});
        out body;
    `;

    try {
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        const data = await response.json();

        const results = data.elements.map(place => {
            const dist = map.distance(userPos, [place.lat, place.lon]);
            const name = place.tags?.name || place.tags?.['name:en'] || categoryName;
            return { ...place, distance: dist, displayName: name };
        });

        results.sort((a, b) => a.distance - b.distance);

        loadingSpinner.style.display = 'none';
        renderResults(results, categoryName);

        if (results.length > 0) {
            speak(`Found ${results.length} ${categoryName} nearby. Nearest is ${results[0].displayName}, ${formatDist(results[0].distance)} away.`);
        } else {
            speak(`No ${categoryName} found within 2 kilometers.`);
        }

    } catch (error) {
        loadingSpinner.style.display = 'none';
        resultsList.innerHTML = '<div style="padding:20px;text-align:center;color:#aaa">Could not fetch results. Check your internet connection.</div>';
        log("Overpass Error: " + error);
        speak("Search failed. Please try again.");
    }
};

function formatDist(meters) {
    return meters < 1000 ? Math.round(meters) + ' meters' : (meters / 1000).toFixed(1) + ' kilometers';
}

function renderResults(places, categoryName) {
    if (places.length === 0) {
        resultsList.innerHTML = `<div style="padding:20px;text-align:center;color:#aaa">No ${categoryName} found within 2km.</div>`;
        return;
    }

    places.forEach((place, index) => {
        const item = document.createElement('div');
        item.className = 'result-item';

        const distDisplay = place.distance < 1000
            ? Math.round(place.distance) + ' m'
            : (place.distance / 1000).toFixed(1) + ' km';

        const walkMin = Math.round(place.distance / 80); // ~80m per min

        // ACCESSIBILITY: Full aria-label for TalkBack
        item.setAttribute('role', 'listitem');
        item.setAttribute('aria-label',
            `${place.displayName}, ${distDisplay} away, about ${walkMin} minute walk. Double tap Go to navigate.`);

        item.innerHTML = `
            <div class="result-info">
                <h3>${place.displayName}</h3>
                <p>${distDisplay} · ~${walkMin} min walk</p>
            </div>
            <button 
                class="go-btn" 
                aria-label="Navigate to ${place.displayName}"
                onclick="startRouteTo(${place.lat}, ${place.lon}, '${place.displayName}')">
                Go
            </button>
        `;
        resultsList.appendChild(item);
    });
}

window.closeResults = function () {
    resultsView.style.display = 'none';
    categoryGrid.style.display = 'grid';
    speak("Back to categories.");
};

window.startRouteTo = function (lat, lon, name) {
    const mapBtn = document.querySelectorAll('.nav-item')[1];
    switchTab('view-map', mapBtn);

    if (userMarker) {
        const userPos = userMarker.getLatLng();
        setDestination(userPos.lat, userPos.lng, lat, lon);
        speak(`Setting route to ${name || 'destination'}.`);
    }
};

// ============================================================
// VOICE CONTROL
// ============================================================
let recognition;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-IN'; // Better for Indian English accent
    recognition.interimResults = false;

    recognition.onstart = () => {
        micBtn.classList.add('listening');
        if (voiceStatus) { voiceStatus.textContent = "Listening..."; voiceStatus.classList.add('visible'); }
    };

    recognition.onend = () => {
        micBtn.classList.remove('listening');
        if (voiceStatus) voiceStatus.classList.remove('visible');
    };

    recognition.onerror = (e) => {
        log("Mic error: " + e.error);
        micBtn.classList.remove('listening');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase().trim();
        log(`Voice: "${transcript}"`);
        if (voiceStatus) {
            voiceStatus.textContent = `"${transcript}"`;
            voiceStatus.classList.add('visible');
            setTimeout(() => voiceStatus.classList.remove('visible'), 3000);
        }
        handleVoiceCommand(transcript);
    };

    micBtn.addEventListener('click', () => {
        try { recognition.start(); speak("Listening."); }
        catch (e) { log("Mic: " + e); }
    });
} else {
    if (micBtn) micBtn.style.display = 'none';
    log("Speech Recognition not supported.");
}

function handleVoiceCommand(text) {
    // Navigation commands
    if (text.includes("take me to") || text.includes("navigate to") || text.includes("go to")) {
        const dest = text.replace(/take me to|navigate to|go to/g, '').trim();
        if (dest.length > 0) {
            speak(`Searching for ${dest}.`);
            performSearch(dest);
        }
    }
    // Stop navigation
    else if (text.includes("stop") || text.includes("cancel")) {
        sendCommand('S');
        navigationActive = false;
        speak("Navigation stopped.");
        log("Navigation stopped by voice.");
    }
    // Where am I
    else if (text.includes("where am i") || text.includes("my location")) {
        if (userMarker) {
            const pos = userMarker.getLatLng();
            updateLocationBanner(pos.lat, pos.lng);
            speak("Fetching your current location.");
        }
    }
    // Category search
    else if (text.includes("find") || text.includes("nearest") || text.includes("nearby")) {
        for (const category of Object.keys(osmTagMap)) {
            if (text.includes(category.toLowerCase())) {
                const tag = osmTagMap[category];
                findNearby(category, tag[0], tag[1]);
                return;
            }
        }
        speak("I didn't understand that category. Try saying find banks or find hospital.");
    }
    // Help
    else if (text.includes("help")) {
        speak("You can say: take me to a place name, find banks, find hospital, where am I, or stop navigation.");
    }
    else {
        speak("I didn't understand. Try saying take me to, find hospital, or stop navigation.");
    }
}

// ============================================================
// SEARCH (Geocoder → Route)
// ============================================================
function performSearch(query) {
    if (!L.Control.Geocoder) { log("Geocoder not loaded."); return; }

    const geocoder = L.Control.Geocoder.nominatim();
    geocoder.geocode(query, (results) => {
        if (results && results.length > 0) {
            const result = results[0];
            log(`Found: ${result.name}`);
            speak(`Found ${result.name}. Calculating route.`);
            if (userMarker) {
                const pos = userMarker.getLatLng();
                setDestination(pos.lat, pos.lng, result.center.lat, result.center.lng);
                const mapBtn = document.querySelectorAll('.nav-item')[1];
                switchTab('view-map', mapBtn);
            } else {
                speak("GPS not ready. Please wait.");
            }
        } else {
            speak("Destination not found. Please try again.");
            log("Geocoder: no results for " + query);
        }
    });
}

window.searchAndRoute = performSearch;

// ============================================================
// GUARDIAN SOS BUTTON
// ============================================================
guardianBtn.addEventListener('click', () => {
    if (!userMarker) {
        speak("GPS location not found yet.");
        alert("GPS Location not found yet. Please wait.");
        return;
    }
    const pos = userMarker.getLatLng();
    const mapLink = `https://www.google.com/maps/search/?api=1&query=${pos.lat},${pos.lng}`;
    const msg = `🆘 HELP! I need assistance. My current location:\n${mapLink}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(whatsappUrl, '_blank');
    speak("Sending SOS to guardian.");
    log("SOS sent.");
});

// ============================================================
// GUIDANCE MODAL
// ============================================================
window.showGuidance = function () {
    document.getElementById('guidance-modal').style.display = 'block';
};

window.closeGuidance = function () {
    document.getElementById('guidance-modal').style.display = 'none';
};

window.onclick = function (event) {
    const modal = document.getElementById('guidance-modal');
    if (event.target === modal) modal.style.display = 'none';
};

if (!localStorage.getItem('silentCompassVisited')) {
    setTimeout(() => {
        showGuidance();
        localStorage.setItem('silentCompassVisited', 'true');
    }, 1200);
}

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================
window.onerror = function (message, source, lineno) {
    log(`Script Error [${lineno}]: ${message}`);
};

// ============================================================
// INIT
// ============================================================
setTimeout(initMap, 800);

