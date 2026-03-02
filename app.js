// ============================================================
// NAV APP — app.js (v3.0)
// Requirements implemented:
//  1. Nearby places fixed (Overpass, node+way, multi-tag)
//  2. Screen reader mode: touch=announce, double-tap=select
//  3. Guardian live location sharing via WhatsApp
//  4. Voice search biased to user's current region
//  5. 4km search radius
//  6. Professional, clean, no unnecessary clutter
// ============================================================

// ── BLE CONFIG ───────────────────────────────────────────
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

// ── APP STATE ────────────────────────────────────────────
let bleDevice, bleServer, bleService, bleChar;
let isPhoneHapticMode = false;
let map, userMarker, routingControl, destinationPoint;
let currentHeading = 0;
let navigationActive = false;
let currentRoute = null;
let lastInstrIndex = 0;
let lastSpokenInstr = '';
let posBuffer = [];
let lastPos = null;
let navInterval = null;
let lastAnnouncedDist = Infinity;

// ── SCREEN READER STATE ──────────────────────────────────
let screenReaderOn = false;
let srLastTouchEl = null;
let srLastTouchTime = 0;
const SR_DBL_TAP_MS = 380;

// ── GUARDIAN STATE ───────────────────────────────────────
let guardianInterval = null;
let guardianNumber = localStorage.getItem('guardianNumber') || '';
let guardianTracking = false;

// ── CATEGORY DEFINITIONS (multi-tag, node+way) ───────────
const CATEGORIES = {
    'Banks': { emoji: '🏦', tags: [{ k: 'amenity', v: 'bank' }, { k: 'amenity', v: 'atm' }] },
    'Health': { emoji: '🏥', tags: [{ k: 'amenity', v: 'hospital' }, { k: 'amenity', v: 'clinic' }, { k: 'amenity', v: 'pharmacy' }, { k: 'amenity', v: 'doctors' }, { k: 'healthcare', v: 'hospital' }] },
    'Food': { emoji: '🍽️', tags: [{ k: 'amenity', v: 'restaurant' }, { k: 'amenity', v: 'cafe' }, { k: 'amenity', v: 'fast_food' }, { k: 'amenity', v: 'canteen' }, { k: 'amenity', v: 'food_court' }] },
    'Transport': { emoji: '🚌', tags: [{ k: 'highway', v: 'bus_stop' }, { k: 'amenity', v: 'bus_station' }, { k: 'amenity', v: 'taxi' }, { k: 'amenity', v: 'ferry_terminal' }] },
    'Education': { emoji: '🎓', tags: [{ k: 'amenity', v: 'school' }, { k: 'amenity', v: 'college' }, { k: 'amenity', v: 'university' }, { k: 'amenity', v: 'kindergarten' }] },
    'Stores': { emoji: '🛒', tags: [{ k: 'shop', v: 'supermarket' }, { k: 'shop', v: 'convenience' }, { k: 'shop', v: 'general' }, { k: 'amenity', v: 'marketplace' }] },
    'Public': { emoji: '🏛️', tags: [{ k: 'amenity', v: 'post_office' }, { k: 'amenity', v: 'police' }, { k: 'amenity', v: 'fire_station' }, { k: 'office', v: 'government' }] },
    'Lodging': { emoji: '🏨', tags: [{ k: 'tourism', v: 'hotel' }, { k: 'tourism', v: 'guest_house' }, { k: 'tourism', v: 'hostel' }, { k: 'tourism', v: 'motel' }] },
    'Arts': { emoji: '🎭', tags: [{ k: 'tourism', v: 'museum' }, { k: 'tourism', v: 'gallery' }, { k: 'amenity', v: 'theatre' }, { k: 'tourism', v: 'attraction' }] },
    'Worship': { emoji: '🛕', tags: [{ k: 'amenity', v: 'place_of_worship' }, { k: 'religion', v: 'hindu' }, { k: 'religion', v: 'muslim' }, { k: 'religion', v: 'christian' }, { k: 'religion', v: 'sikh' }] },
    'Parks': { emoji: '🌳', tags: [{ k: 'leisure', v: 'park' }, { k: 'leisure', v: 'garden' }, { k: 'leisure', v: 'playground' }, { k: 'leisure', v: 'nature_reserve' }] },
    'Tourism': { emoji: '🗺️', tags: [{ k: 'tourism', v: 'attraction' }, { k: 'tourism', v: 'viewpoint' }, { k: 'historic', v: 'monument' }, { k: 'historic', v: 'memorial' }, { k: 'tourism', v: 'theme_park' }] },
};

// ── UI ELEMENT REFS ──────────────────────────────────────
const connectBtn = document.getElementById('connect-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const controlPanel = document.getElementById('control-panel');
const logOutput = document.getElementById('log-output');
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnStop = document.getElementById('btn-stop');
const micBtn = document.getElementById('mic-btn');
const voiceStatus = document.getElementById('voice-status');
const demoBtn = document.getElementById('demo-btn');
const resultsView = document.getElementById('results-view');
const categoryGrid = document.getElementById('category-grid');
const resultsList = document.getElementById('results-list');
const resultsTitle = document.getElementById('results-title');
const loadingSpinner = document.getElementById('loading-spinner');
const confirmPanel = document.getElementById('confirmation-panel');
const routeInfo = document.getElementById('route-info');
const startNavBtn = document.getElementById('start-nav-btn');
const srToggle = document.getElementById('sr-toggle');
const srStatus = document.getElementById('sr-status');

// ============================================================
// LOGGER
// ============================================================
function log(msg) {
    if (!logOutput) return;
    const t = new Date().toLocaleTimeString();
    logOutput.innerHTML = `<div>[${t}] ${msg}</div>` + logOutput.innerHTML;
}

// ============================================================
// SPEAK
// ============================================================
// ── SPEECH RELIABILITY — Unlocking & Voice Selection ─────
let speechUnlocked = false;
let selectedVoice = null;

function detectSpeechSupport() {
    // 1. Check if we are in a Native Capacitor environment
    if (window.Capacitor && window.Capacitor.isPluginAvailable('TextToSpeech')) {
        return 'native';
    }

    // 2. Direct check
    let synth = (typeof window !== 'undefined' && (window.speechSynthesis || window.webkitSpeechSynthesis))
        || (typeof speechSynthesis !== 'undefined' ? speechSynthesis : null);

    // 3. Iframe Recovery Trick (for restricted WebViews)
    if (!synth) {
        try {
            const frame = document.createElement('iframe');
            frame.style.display = 'none';
            document.body.appendChild(frame);
            synth = frame.contentWindow.speechSynthesis || frame.contentWindow.webkitSpeechSynthesis || null;
            if (synth) log('Speech API recovered via iframe trick');
        } catch (e) { }
    }

    if (supportCheckCount === 1) {
        log(`Protocol: ${location.protocol}`);
        log(`Secure Context: ${window.isSecureContext}`);
        log(`Native Bridge: ${!!window.Capacitor}`);
        log(`UA: ${navigator.userAgent.slice(0, 40)}...`);
    }
    return synth;
}

function loadVoices() {
    const synth = detectSpeechSupport();
    if (!synth) return;

    const voices = synth.getVoices();
    if (voices && voices.length > 0) {
        selectedVoice = voices.find(v => v.lang === 'en-IN')
            || voices.find(v => v.lang.startsWith('en'))
            || voices[0];
        if (selectedVoice) log(`Voice loaded: ${selectedVoice.name} (${selectedVoice.lang})`);
    } else {
        log('Speech API ready, but no voices found yet (waiting...)');
    }
}

// Check every second for 5 seconds (some WebViews lazy-load the API)
let supportCheckCount = 0;
const supportCheckInterval = setInterval(() => {
    supportCheckCount++;
    const synth = detectSpeechSupport();
    if (synth) {
        log(`Speech API detected on attempt ${supportCheckCount}`);
        clearInterval(supportCheckInterval);
        if (synth.onvoiceschanged !== undefined) {
            synth.onvoiceschanged = loadVoices;
        }
        loadVoices();
    } else if (supportCheckCount >= 5) {
        clearInterval(supportCheckInterval);
        log('CRITICAL: Speech Synthesis object missing after 5s');
    }
}, 1000);

function unlockSpeech() {
    const synth = detectSpeechSupport();
    if (speechUnlocked || !synth) return;
    try {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        synth.speak(u);
        speechUnlocked = true;
        log('Speech engine unlocked');
    } catch (e) {
        log('Unlock failed: ' + e);
    }
}

function speak(text, interrupt = true, force = false) {
    // NOTE: speech always plays — screenReaderOn controls touch-announce only.
    // 'force' kept for backward compatibility but no longer gates speech.

    const support = detectSpeechSupport();

    // CASE A: NATIVE CAPACITOR TTS (Best for Android)
    if (support === 'native') {
        try {
            log(`Native Speak: "${text.slice(0, 20)}..."`);
            window.Capacitor.Plugins.TextToSpeech.speak({
                text: text,
                lang: 'en-IN',
                rate: 1.0,
                pitch: 1.0,
                volume: 1.0,
                category: 'ambient'
            });
            return;
        } catch (e) {
            log('Native Speak Error: ' + e);
        }
    }

    // CASE B: WEB SPEECH SYNTHESIS (Fallback)
    const synth = (typeof support === 'object') ? support : detectSpeechSupport();
    if (!synth || typeof synth === 'string') {
        log('CRITICAL: No Speech support found (neither Native nor Web)');
        return;
    }

    setTimeout(() => {
        try {
            if (interrupt) synth.cancel();

            if (synth.paused) {
                log('Speech engine was paused, resuming...');
                synth.resume();
            }

            if (typeof SpeechSynthesisUtterance === 'undefined') {
                log('CRITICAL: SpeechSynthesisUtterance missing');
                return;
            }

            const u = new SpeechSynthesisUtterance(text);
            if (selectedVoice) u.voice = selectedVoice;
            u.lang = selectedVoice ? selectedVoice.lang : 'en-IN';
            u.rate = 0.93;
            u.volume = 1;

            log(`Web Speech req: "${text.slice(0, 25)}..."`);
            synth.speak(u);

            const rInterval = setInterval(() => {
                if (synth.speaking) synth.resume();
                else clearInterval(rInterval);
            }, 5000);
        } catch (e) {
            log('Speak Error: ' + e);
        }
    }, 15);
}

// ============================================================
// SCREEN READER MODE
// Touch once  → announce element
// Double-tap  → activate element
// ============================================================
function initScreenReader() {
    // Restore preference
    screenReaderOn = localStorage.getItem('screenReader') === 'true';
    updateSRUI();

    srToggle.addEventListener('change', () => {
        screenReaderOn = srToggle.checked;
        localStorage.setItem('screenReader', screenReaderOn);
        updateSRUI();
        speak(screenReaderOn
            ? 'Screen reader on. Touch any button once to hear it. Double tap to activate.'
            : 'Screen reader off.', true, true);
    });

    const testBtn = document.getElementById('sr-test-btn');
    if (testBtn) {
        testBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            log('Manual test requested');
            unlockSpeech(); // Re-attempt unlock
            speak('Testing the audio engine. If you hear this, the setup is correct.', true, true);
        });
    }
}

function updateSRUI() {
    srToggle.checked = screenReaderOn;
    srStatus.textContent = screenReaderOn ? 'On' : 'Off';
    document.body.classList.toggle('sr-mode', screenReaderOn);
}

// Attach SR touch handling to an element
function attachSR(el) {
    // Remove old listeners to avoid duplication
    el.removeEventListener('touchend', srTouchEnd);
    el.removeEventListener('touchstart', srTouchStart);
    el.addEventListener('touchstart', srTouchStart, { passive: true });
    el.addEventListener('touchend', srTouchEnd, { passive: false });
}

function srTouchStart(e) {
    if (!screenReaderOn) return;
    e.stopPropagation();
    const el = e.currentTarget;
    const now = Date.now();

    // Visual highlight
    document.querySelectorAll('.sr-focused').forEach(node => node.classList.remove('sr-focused'));
    el.classList.add('sr-focused');

    // Announce immediately on the first touch of a potential double tap
    if (srLastTouchEl !== el || (now - srLastTouchTime) > SR_DBL_TAP_MS) {
        const label = el.getAttribute('aria-label')
            || el.dataset.srLabel
            || el.textContent.trim().replace(/\s+/g, ' ');

        if (label) {
            speak(label, true);
            showSRHint('Double-tap to activate');
        }
    }
}

function srTouchEnd(e) {
    if (!screenReaderOn) return;
    e.stopPropagation();
    e.preventDefault(); // block ghost click

    const el = e.currentTarget;
    const now = Date.now();

    if (srLastTouchEl === el && (now - srLastTouchTime) < SR_DBL_TAP_MS) {
        // Double tap → activate
        srLastTouchEl = null;
        srLastTouchTime = 0;
        el.classList.remove('sr-focused');
        speak('Activating.', true);
        el.click();
    } else {
        // Single tap ended → record for double tap detection
        srLastTouchEl = el;
        srLastTouchTime = now;
    }
}

// Show a temporary hint banner
function showSRHint(msg) {
    let hint = document.getElementById('sr-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'sr-hint';
        document.body.appendChild(hint);
    }
    hint.textContent = msg;
    hint.className = 'sr-hint visible';
    clearTimeout(hint._t);
    hint._t = setTimeout(() => hint.classList.remove('visible'), 1800);
}

// Attach SR to all interactive elements and re-attach when new ones added
function attachSRToAll() {
    document.querySelectorAll('button, .cat-btn, .result-item, [role="button"], .nav-item')
        .forEach(attachSR);
}

// ============================================================
// TAB SWITCHING
// ============================================================
window.switchTab = function (tabId, btnEl) {
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    if (tabId === 'view-map' && map) setTimeout(() => map.invalidateSize(), 100);
    if (screenReaderOn) speak(tabId.replace('view-', '') + ' tab');
};

// ============================================================
// BLUETOOTH
// ============================================================
async function connectHandler() {
    if (!navigator.bluetooth) {
        alert('Web Bluetooth not supported. Use Chrome on Android.');
        return;
    }
    try {
        log('Requesting BLE device...');
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ services: [SERVICE_UUID] }]
        });
        bleDevice.addEventListener('gattserverdisconnected', onBLEDisconnected);
        bleServer = await bleDevice.gatt.connect();
        bleService = await bleServer.getPrimaryService(SERVICE_UUID);
        bleChar = await bleService.getCharacteristic(CHARACTERISTIC_UUID);
        log('BLE connected');
        speak('Wristband connected.');
        setConnectedState(true);
    } catch (err) {
        if (!err.toString().includes('User cancelled')) {
            log('BLE error: ' + err);
            alert('Connection failed. Ensure Bluetooth is on and device is powered.');
        }
    }
}

function onBLEDisconnected() {
    bleChar = null;
    log('BLE disconnected');
    speak('Wristband disconnected.');
    setConnectedState(false);
}

function setConnectedState(on) {
    statusDot.className = 'status-indicator ' + (on ? 'connected' : 'disconnected');
    statusText.textContent = on
        ? (isPhoneHapticMode ? 'Phone Haptics Active' : 'Wristband Connected')
        : 'Disconnected';
    connectBtn.textContent = on ? 'Disconnect' : 'Connect Device';
    connectBtn.onclick = on
        ? () => {
            if (isPhoneHapticMode) {
                isPhoneHapticMode = false;
                demoBtn.style.display = 'block';
                speak('Phone Haptics deactivated.', true, true);
            }
            if (bleDevice) bleDevice.gatt.disconnect();
            setConnectedState(false);
        }
        : connectHandler;
    controlPanel.classList.toggle('disabled', !on);
}

connectBtn.addEventListener('click', connectHandler);

// ── COMMAND SEND ─────────────────────────────────────────
async function sendCommand(cmd, force = false) {
    if (isPhoneHapticMode || force) {
        log('[Haptic' + (force ? ' Test' : '') + '] ' + cmd);
        const Haptics = window.Capacitor?.Plugins?.Haptics;
        if (!Haptics) {
            log('Haptics plugin not found, falling back to navigator');
            const p = { L: [200, 100, 200], R: [500], F: [100], A: [500, 200, 500], S: [200] };
            if (navigator.vibrate) navigator.vibrate(p[cmd] || [200]);
            return;
        }

        try {
            if (cmd === 'L') {
                await Haptics.vibrate({ duration: 200 });
                setTimeout(() => Haptics.vibrate({ duration: 200 }), 300);
            } else if (cmd === 'R') {
                await Haptics.vibrate({ duration: 400 }); // Sharp medium pulse
            } else if (cmd === 'A') {
                // Rhythmic "Arrival" pattern: Dot-Dot-Dash (Victory)
                await Haptics.vibrate({ duration: 200 });
                await new Promise(r => setTimeout(r, 150));
                await Haptics.vibrate({ duration: 200 });
                await new Promise(r => setTimeout(r, 150));
                await Haptics.vibrate({ duration: 1000 }); // Final long pulse
            } else {
                await Haptics.vibrate({ duration: 150 });
            }
        } catch (e) {
            log('Haptic Error: ' + e);
        }
        return;
    }
    if (!bleChar) return;
    try {
        await bleChar.writeValue(new TextEncoder().encode(cmd));
    } catch (e) {
        log('Send error: ' + e);
    }
}

demoBtn.addEventListener('click', () => {
    isPhoneHapticMode = true;
    setConnectedState(true);
    demoBtn.style.display = 'none';
    speak('Phone Haptic mode active. The phone will vibrate for navigation.', true, true);
    log('Haptics active');
});

// Settings-page mirror of phone haptic button (was duplicate id — now separate)
const demoBtnSettings = document.getElementById('demo-btn-settings');
if (demoBtnSettings) {
    demoBtnSettings.addEventListener('click', () => demoBtn.click());
}

// ── HAPTIC TUTORIAL SYSTEM ───────────────────────────────
const htButtons = [
    { id: 'ht-left', cmd: 'L', text: 'To turn left, the phone will give two short pulses like this.' },
    { id: 'ht-right', cmd: 'R', text: 'To turn right, the phone will give one long pulse like this.' },
    { id: 'ht-deviation', cmd: 'F', text: 'If you drift off the path, the phone will give short ticks.' },
    { id: 'ht-arrival', cmd: 'A', text: 'When you arrive, you will feel a series of long vibrations.' }
];

htButtons.forEach(btnInfo => {
    const el = document.getElementById(btnInfo.id);
    if (el) {
        el.addEventListener('click', () => {
            log(`Tutorial: ${btnInfo.id}`);
            speak(btnInfo.text, true, true);
            // Delay vibration slightly so voice can start
            setTimeout(() => sendCommand(btnInfo.cmd, true), 800);
        });
    }
});

btnLeft.addEventListener('click', () => sendCommand('L'));
btnRight.addEventListener('click', () => sendCommand('R'));
btnStop.addEventListener('click', () => {
    sendCommand('S');
    navigationActive = false;
    if (navInterval) clearInterval(navInterval);
    speak('Navigation stopped.');
});

// ============================================================
// GPS SMOOTHING
// ============================================================
function smoothedPosition(lat, lng) {
    posBuffer.push({ lat, lng });
    if (posBuffer.length > 5) posBuffer.shift();
    const sum = posBuffer.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 });
    return { lat: sum.lat / posBuffer.length, lng: sum.lng / posBuffer.length };
}

// ============================================================
// MAP INIT
// ============================================================
function initMap() {
    if (typeof L === 'undefined') { log('Leaflet not loaded'); return; }

    try {
        // Start at Kozhikode, Kerala
        map = L.map('map').setView([11.2588, 75.7804], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(map);

        map.on('click', (e) => {
            if (userMarker) {
                const p = userMarker.getLatLng();
                setDestination(p.lat, p.lng, e.latlng.lat, e.latlng.lng);
            } else {
                speak('Waiting for GPS.');
            }
        });

        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                (pos) => {
                    const smooth = smoothedPosition(pos.coords.latitude, pos.coords.longitude);
                    if (lastPos) {
                        currentHeading = calculateBearing(lastPos.lat, lastPos.lng, smooth.lat, smooth.lng);
                    }
                    lastPos = smooth;

                    if (!userMarker) {
                        userMarker = L.marker([smooth.lat, smooth.lng])
                            .addTo(map)
                            .bindPopup('You are here')
                            .openPopup();
                        map.setView([smooth.lat, smooth.lng], 17);
                        speak('GPS connected. Location found.');
                        log('GPS found');
                        updateLocationBanner(smooth.lat, smooth.lng);
                    } else {
                        userMarker.setLatLng([smooth.lat, smooth.lng]);
                    }
                },
                (err) => log('GPS error: ' + err.message),
                { enableHighAccuracy: true, maximumAge: 1000 }
            );
        }

        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (e) => {
                if (e.alpha && !lastPos) currentHeading = 360 - e.alpha;
            });
        }
    } catch (e) {
        log('Map init error: ' + e);
    }
}

// ── REVERSE GEOCODE ──────────────────────────────────────
async function updateLocationBanner(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        const addr = data.address;
        const loc = addr.road || addr.suburb || addr.neighbourhood || 'Current Location';
        const city = addr.city || addr.town || addr.state || '';
        const el1 = document.getElementById('banner-location');
        const el2 = document.getElementById('banner-sublocation');
        if (el1) el1.textContent = loc;
        if (el2) el2.textContent = city;
    } catch (e) {
        log('Geocode error: ' + e);
    }
}

// ============================================================
// ROUTING & NAVIGATION
// ============================================================
function setDestination(startLat, startLng, destLat, destLng) {
    if (routingControl) map.removeControl(routingControl);
    navigationActive = false;
    lastInstrIndex = 0;
    lastSpokenInstr = '';
    lastAnnouncedDist = Infinity;
    destinationPoint = L.latLng(destLat, destLng);
    confirmPanel.style.display = 'none';

    log('Calculating route...');
    speak('Calculating route. Please wait.');

    routingControl = L.Routing.control({
        waypoints: [L.latLng(startLat, startLng), L.latLng(destLat, destLng)],
        routeWhileDragging: false,
        showAlternatives: false,
        lineOptions: { styles: [{ color: '#2fbad3', weight: 5 }] },
        createMarker: () => null,
    }).on('routesfound', (e) => {
        currentRoute = e.routes[0];
        const dist = (currentRoute.summary.totalDistance / 1000).toFixed(1);
        const mins = Math.round(currentRoute.summary.totalTime / 60);
        log(`Route: ${dist} km, ${mins} min`);
        confirmPanel.style.display = 'block';
        routeInfo.textContent = `${dist} km · ~${mins} min`;
        speak(`Route found. ${dist} kilometers, about ${mins} minutes. Press Start to begin.`);

        startNavBtn.onclick = () => {
            navigationActive = true;
            lastInstrIndex = 0;
            confirmPanel.style.display = 'none';
            speak('Navigation started. Walk forward.');
            log('Nav active');
            startNavLoop();
        };
    }).on('routingerror', () => {
        speak('Route not found. Try a different destination.');
    }).addTo(map);
}

function startNavLoop() {
    if (navInterval) clearInterval(navInterval);
    navInterval = setInterval(() => {
        if (!navigationActive || !userMarker || !currentRoute) return;
        const pos = userMarker.getLatLng();

        // Arrival
        if (destinationPoint && map.distance(pos, destinationPoint) < 15) {
            speak('You have arrived at your destination.');
            sendCommand('A');
            if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
            navigationActive = false;
            clearInterval(navInterval);
            log('Arrived');
            return;
        }

        // Distance milestones
        if (destinationPoint) {
            const d = map.distance(pos, destinationPoint);
            for (const t of [500, 300, 200, 100, 50]) {
                if (d < t + 10 && lastAnnouncedDist > t + 10) {
                    speak(`${t} meters to destination.`);
                    lastAnnouncedDist = d;
                    break;
                }
            }
        }

        // Off-route check
        if (currentRoute.coordinates) {
            const minD = currentRoute.coordinates.reduce(
                (m, c) => Math.min(m, map.distance(pos, c)), Infinity
            );
            if (minD > 40) {
                speak('Off route. Recalculating.');
                const dest = currentRoute.waypoints[currentRoute.waypoints.length - 1];
                setDestination(pos.lat, pos.lng, dest.latLng.lat, dest.latLng.lng);
                return;
            }
        }

        // Turn-by-turn
        const instrs = currentRoute.instructions;
        if (!instrs || lastInstrIndex >= instrs.length) return;

        if (lastInstrIndex + 1 < instrs.length) {
            const next = instrs[lastInstrIndex + 1];
            const tp = currentRoute.coordinates[next.index];
            if (!tp) return;
            const dist = map.distance(pos, tp);

            if (dist < 8) {
                lastInstrIndex++;
                speak(next.text || 'Continue.');
                return;
            }
            if (dist < 35) {
                const key = next.type + '_' + lastInstrIndex;
                if (key !== lastSpokenInstr) {
                    lastSpokenInstr = key;
                    const t = (next.text || '').toLowerCase();
                    if (t.includes('right') || next.type === 'TurnRight') {
                        speak(`Turn right in ${Math.round(dist)} meters.`);
                        sendCommand('R');
                    } else if (t.includes('left') || next.type === 'TurnLeft') {
                        speak(`Turn left in ${Math.round(dist)} meters.`);
                        sendCommand('L');
                    } else {
                        sendCommand('F');
                    }
                }
            }
        }
    }, 2200);
}

function calculateBearing(lat1, lng1, lat2, lng2) {
    const r = d => d * Math.PI / 180;
    const y = Math.sin(r(lng2 - lng1)) * Math.cos(r(lat2));
    const x = Math.cos(r(lat1)) * Math.sin(r(lat2))
        - Math.sin(r(lat1)) * Math.cos(r(lat2)) * Math.cos(r(lng2 - lng1));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ============================================================
// HAVERSINE (no map dependency)
// ============================================================
function haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
        * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(m) {
    return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km';
}

// ============================================================
// NEARBY SEARCH — Overpass API, node+way, multi-tag, 4km
// ============================================================
function buildOverpassQuery(cat, lat, lng, radius) {
    const parts = [];
    for (const { k, v } of cat.tags) {
        parts.push(`node["${k}"="${v}"](around:${radius},${lat},${lng});`);
        parts.push(`way["${k}"="${v}"](around:${radius},${lat},${lng});`);
    }
    return `[out:json][timeout:60];(${parts.join('')});out center;`;
}

function getOSMCoords(el) {
    if (el.lat && el.lon) return { lat: +el.lat, lng: +el.lon };
    if (el.center) return { lat: +el.center.lat, lng: +el.center.lon };
    return null;
}

function getOSMName(el, fallback) {
    const t = el.tags || {};
    return t['name:en'] || t['name'] || t['brand'] || t['operator'] || fallback;
}

window.findNearby = async function (categoryName) {
    if (!userMarker) {
        speak('Please wait for GPS location first.');
        return;
    }

    const cat = CATEGORIES[categoryName];
    if (!cat) { log('Unknown category: ' + categoryName); return; }

    // Show results UI
    categoryGrid.style.display = 'none';
    resultsView.style.display = 'block';
    resultsList.innerHTML = '';
    loadingSpinner.style.display = 'block';
    resultsTitle.textContent = `${cat.emoji}  ${categoryName} Nearby`;
    speak(`Searching for ${categoryName} within 4 kilometers.`);
    log(`Fetching ${categoryName}...`);

    const pos = userMarker.getLatLng();
    const radius = 4000; // 4km
    const query = buildOverpassQuery(cat, pos.lat, pos.lng, radius);

    const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.nchc.org.tw/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter'
    ];

    let data = null;
    let lastErr = null;

    for (const api of endpoints) {
        try {
            log(`Trying mirror: ${new URL(api).hostname}`);
            const res = await fetch(`${api}?data=${encodeURIComponent(query)}`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            data = await res.json();
            log(`Success from ${new URL(api).hostname}`);
            break;
        } catch (err) {
            log(`Mirror failed: ${err.message}`);
            lastErr = err;
        }
    }

    if (!data) {
        loadingSpinner.style.display = 'none';
        resultsList.innerHTML = `
            <div style="padding:24px;text-align:center;color:var(--text-muted)">
                <p style="margin-bottom:14px">Search failed: All mirrors unresponsive.</p>
                <button onclick="findNearby('${categoryName}')"
                    style="background:var(--accent);color:#0a0f1a;border:none;
                           padding:10px 24px;border-radius:20px;font-weight:700;cursor:pointer;">
                    Retry
                </button>
            </div>`;
        speak('Search failed. All servers are busy.');
        return;
    }

    try {
        log(`${categoryName}: ${data.elements.length} raw results`);
        const seen = new Set();
        const results = [];

        for (const el of data.elements) {
            const coords = getOSMCoords(el);
            if (!coords) continue;
            const name = getOSMName(el, categoryName);

            // Filter exclusions
            if (cat.excludeNames) {
                const lowerName = name.toLowerCase();
                if (cat.excludeNames.some(ex => lowerName.includes(ex.toLowerCase()))) {
                    continue;
                }
            }

            const dedup = `${name.slice(0, 8)}_${Math.round(coords.lat * 1000)}_${Math.round(coords.lng * 1000)}`;
            if (seen.has(dedup)) continue;
            seen.add(dedup);
            results.push({
                name,
                lat: coords.lat,
                lng: coords.lng,
                dist: haversineM(pos.lat, pos.lng, coords.lat, coords.lng)
            });
        }

        results.sort((a, b) => a.dist - b.dist);
        loadingSpinner.style.display = 'none';
        renderResults(results, categoryName, cat.emoji);

        if (results.length === 0) {
            speak(`No ${categoryName} found within 4 kilometers.`);
        } else {
            speak(`Found ${results.length} ${categoryName}. Nearest is ${results[0].name}, ${fmtDist(results[0].dist)} away. Touch a result to hear details, double tap Go to navigate.`);
        }

        setTimeout(attachSRToAll, 100);

    } catch (err) {
        log('Processing error: ' + err);
        speak('Error processing results.');
    }
};

function renderResults(places, categoryName, emoji) {
    if (!places.length) {
        resultsList.innerHTML = `
            <div style="padding:28px;text-align:center;">
                <div style="font-size:2rem;margin-bottom:10px">${emoji}</div>
                <p style="color:var(--text-muted)">No ${categoryName} found within 4 km</p>
            </div>`;
        return;
    }

    const count = document.createElement('div');
    count.style.cssText = 'color:var(--text-muted);font-size:0.8rem;margin-bottom:12px;padding:0 2px;';
    count.textContent = `${places.length} place${places.length > 1 ? 's' : ''} found`;
    resultsList.appendChild(count);

    places.forEach(p => {
        const walk = Math.max(1, Math.round(p.dist / 80));
        const dStr = fmtDist(p.dist);
        const label = `${p.name}. ${dStr} away. About ${walk} minute walk. Double tap Go to navigate.`;

        const item = document.createElement('div');
        item.className = 'result-item';
        item.setAttribute('role', 'listitem');
        item.setAttribute('aria-label', label);
        item.dataset.srLabel = label;

        item.innerHTML = `
            <div class="result-info">
                <h3>${emoji} ${p.name}</h3>
                <p>${dStr} &nbsp;·&nbsp; ~${walk} min</p>
            </div>
            <button class="go-btn"
                aria-label="Navigate to ${p.name}"
                data-sr-label="Go to ${p.name}. Double tap to start navigation."
                onclick="startRouteTo(${p.lat}, ${p.lng}, '${p.name.replace(/'/g, "\\'")}')">
                Go
            </button>`;
        resultsList.appendChild(item);
    });
}

window.closeResults = function () {
    resultsView.style.display = 'none';
    categoryGrid.style.display = 'grid';
    speak('Back to categories.');
};

window.startRouteTo = function (lat, lng, name) {
    const mapBtn = document.querySelectorAll('.nav-item')[1];
    switchTab('view-map', mapBtn);
    if (userMarker) {
        const p = userMarker.getLatLng();
        setDestination(p.lat, p.lng, lat, lng);
        speak(`Setting route to ${name}.`);
    }
};

// ============================================================
// VOICE SEARCH — biased to user's current region
// Fixes the "said Kanhangad, got Tamil Nadu" issue
// ============================================================
function performSearch(query) {
    if (!L.Control.Geocoder) { log('Geocoder not loaded'); return; }

    const geocoder = L.Control.Geocoder.nominatim();

    // Build a viewbox biased to a ~100km box around user's position
    // This makes "Kanhangad" resolve to Kerala, not Tamil Nadu
    let geocodeOptions = {};
    if (userMarker) {
        const p = userMarker.getLatLng();
        const d = 1.0; // ~110km in degrees
        // Nominatim supports countrycodes and viewbox for bias
        geocodeOptions = {
            geocodingQueryParams: {
                viewbox: `${p.lng - d},${p.lat + d},${p.lng + d},${p.lat - d}`,
                bounded: 1,   // strictly limit to viewbox first
                countrycodes: 'in'
            }
        };
    }

    // First try bounded search
    geocoder.geocode(query, (results) => {
        if (results && results.length > 0) {
            const r = results[0];
            log(`Found (bounded): ${r.name}`);
            speak(`Found ${r.name}. Calculating route.`);
            if (userMarker) {
                const p = userMarker.getLatLng();
                setDestination(p.lat, p.lng, r.center.lat, r.center.lng);
                switchTab('view-map', document.querySelectorAll('.nav-item')[1]);
            }
        } else {
            // Fallback: unbounded search within India
            geocoder.geocode(query + ' India', (results2) => {
                if (results2 && results2.length > 0) {
                    const r = results2[0];
                    log(`Found (fallback): ${r.name}`);
                    speak(`Found ${r.name}. Calculating route.`);
                    if (userMarker) {
                        const p = userMarker.getLatLng();
                        setDestination(p.lat, p.lng, r.center.lat, r.center.lng);
                        switchTab('view-map', document.querySelectorAll('.nav-item')[1]);
                    }
                } else {
                    speak('Destination not found. Please try again.');
                    log('No geocode results for: ' + query);
                }
            });
        }
    }, geocodeOptions);
}

window.searchAndRoute = performSearch;

// ============================================================
// VOICE CONTROL
// ============================================================
let recognition;
let isMicListening = false;
const SR_API = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SR_API) {
    recognition = new SR_API();
    recognition.continuous = false;
    recognition.lang = 'en-IN';
    recognition.interimResults = false;

    recognition.onstart = () => {
        isMicListening = true;
        micBtn.classList.add('listening');
        if (voiceStatus) { voiceStatus.textContent = 'Listening...'; voiceStatus.classList.add('visible'); }
    };

    recognition.onend = () => {
        isMicListening = false;
        micBtn.classList.remove('listening');
        if (voiceStatus) setTimeout(() => voiceStatus.classList.remove('visible'), 1200);
    };

    recognition.onerror = (e) => {
        isMicListening = false;
        micBtn.classList.remove('listening');
        log('Mic error: ' + e.error);
        if (e.error === 'no-speech') {
            if (voiceStatus) { voiceStatus.textContent = 'No speech detected. Try again.'; voiceStatus.classList.add('visible'); }
            speak('No speech detected. Tap the mic and try again.');
        } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            speak('Microphone permission denied. Please allow microphone access in your browser settings.');
            if (voiceStatus) { voiceStatus.textContent = 'Microphone access denied.'; voiceStatus.classList.add('visible'); }
        } else {
            if (voiceStatus) { voiceStatus.textContent = 'Mic error: ' + e.error; voiceStatus.classList.add('visible'); }
        }
    };

    recognition.onresult = (e) => {
        const text = e.results[0][0].transcript.toLowerCase().trim();
        log(`Voice: "${text}"`);
        if (voiceStatus) {
            voiceStatus.textContent = `"${text}"`;
            voiceStatus.classList.add('visible');
            setTimeout(() => voiceStatus.classList.remove('visible'), 3000);
        }
        handleVoiceCommand(text);
    };

    micBtn.addEventListener('click', () => {
        if (isMicListening) {
            // Already listening — abort and cancel
            try { recognition.abort(); } catch (e) { /* ignore */ }
            return;
        }
        // Cancel any ongoing TTS first so it doesn't feed into the mic
        try {
            const synth = detectSpeechSupport();
            if (synth && typeof synth !== 'string') synth.cancel();
        } catch (e) { /* ignore */ }

        try {
            recognition.start();
            log('Mic started');
        } catch (e) {
            log('Mic start error: ' + e);
            speak('Could not start microphone. Please try again.');
        }
    });
} else {
    if (micBtn) micBtn.style.display = 'none';
    log('Speech Recognition not supported');
}

function handleVoiceCommand(text) {
    if (/take me to|navigate to|go to|directions to/.test(text)) {
        const dest = text.replace(/take me to|navigate to|go to|directions to/g, '').trim();
        if (dest) { speak(`Searching for ${dest}.`); performSearch(dest); }

    } else if (/find|nearest|nearby/.test(text)) {
        for (const key of Object.keys(CATEGORIES)) {
            if (text.includes(key.toLowerCase())) { findNearby(key); return; }
        }
        speak('Category not found. Try: find banks, find hospital, find food.');

    } else if (/stop|cancel/.test(text)) {
        sendCommand('S');
        navigationActive = false;
        speak('Navigation stopped.');

    } else if (/where am i|my location/.test(text)) {
        if (userMarker) {
            const p = userMarker.getLatLng();
            updateLocationBanner(p.lat, p.lng);
            speak(document.getElementById('banner-location')?.textContent || 'Fetching location.');
        }

    } else if (/help/.test(text)) {
        speak('Say: take me to a place. Or: find banks. Or: where am I. Or: stop navigation.');

    } else {
        speak('Not understood. Try: take me to hospital, or find food.');
    }
}

// ============================================================
// GUARDIAN — Live location sharing
// Saves guardian's WhatsApp number, sends live location link
// Updates every 5 minutes while tracking is active
// ============================================================
function initGuardian() {
    const savedNum = localStorage.getItem('guardianNumber') || '';
    const numInput = document.getElementById('guardian-number');
    if (numInput && savedNum) numInput.value = savedNum;

    const saveBtn = document.getElementById('guardian-save-btn');
    const sosBtn = document.getElementById('guardian-sos-btn');
    const trackBtn = document.getElementById('guardian-track-btn');
    const trackStatus = document.getElementById('guardian-track-status');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const val = numInput ? numInput.value.trim().replace(/\s/g, '') : '';
            if (!val) { speak('Please enter a phone number.'); return; }
            guardianNumber = val;
            localStorage.setItem('guardianNumber', val);
            speak('Guardian number saved.');
            log('Guardian number saved: ' + val);
        });
    }

    if (sosBtn) {
        sosBtn.addEventListener('click', () => {
            if (!userMarker) { speak('GPS not ready yet.'); return; }
            if (!guardianNumber) { speak('Please save a guardian number first.'); return; }
            sendGuardianMessage('SOS');
        });
    }

    if (trackBtn) {
        trackBtn.addEventListener('click', () => {
            if (!guardianNumber) { speak('Please save a guardian number first.'); return; }
            if (guardianTracking) {
                // Stop tracking
                guardianTracking = false;
                if (guardianInterval) clearInterval(guardianInterval);
                guardianInterval = null;
                trackBtn.textContent = 'Start Live Tracking';
                if (trackStatus) trackStatus.textContent = 'Off';
                speak('Live tracking stopped.');
                log('Guardian tracking stopped');
            } else {
                // Start tracking
                if (!userMarker) { speak('Waiting for GPS.'); return; }
                guardianTracking = true;
                trackBtn.textContent = 'Stop Live Tracking';
                if (trackStatus) trackStatus.textContent = 'Active';
                speak('Live tracking started. Guardian will receive your location every 5 minutes.');
                log('Guardian tracking started');
                // Send immediately, then every 5 minutes
                sendGuardianMessage('TRACK');
                guardianInterval = setInterval(() => {
                    if (userMarker && guardianTracking) sendGuardianMessage('TRACK');
                }, 5 * 60 * 1000);
            }
        });
    }
}

function sendGuardianMessage(type) {
    if (!userMarker) return;
    const p = userMarker.getLatLng();
    const link = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
    const time = new Date().toLocaleTimeString();

    let msg;
    if (type === 'SOS') {
        msg = `🆘 EMERGENCY! I need help.\nMy location (${time}):\n${link}`;
        speak('SOS sent to guardian.');
    } else {
        msg = `📍 Location update (${time}):\n${link}\n\n- Sent by NavApp`;
        speak('Location sent to guardian.');
    }

    const url = `https://wa.me/${guardianNumber.replace('+', '')}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    log(`Guardian ${type} sent`);
}

// ============================================================
// GUIDANCE MODAL
// ============================================================
window.showGuidance = function () {
    const m = document.getElementById('guidance-modal');
    if (m) m.style.display = 'flex';
};
window.closeGuidance = function () {
    const m = document.getElementById('guidance-modal');
    if (m) m.style.display = 'none';
};
window.onclick = (e) => {
    const m = document.getElementById('guidance-modal');
    if (m && e.target === m) m.style.display = 'none';
};

if (!localStorage.getItem('appVisited')) {
    setTimeout(() => { showGuidance(); localStorage.setItem('appVisited', 'true'); }, 1000);
}

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================
window.onerror = (msg, src, line) => log(`Error [${line}]: ${msg}`);

// ============================================================
// INIT
// ============================================================
document.addEventListener('touchstart', unlockSpeech, { once: true, passive: true });
document.addEventListener('click', unlockSpeech, { once: true });

setTimeout(() => {
    initMap();
    initScreenReader();
    initGuardian();
    attachSRToAll();
    log('App initialized');
}, 600);

