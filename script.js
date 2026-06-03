// --- Simulated State Variables ---
let north = 0;
let south = 0;
let east = 0;
let west = 0;

let northHeavy = 0;
let southHeavy = 0;
let eastHeavy = 0;
let westHeavy = 0;

let northFast = 0;
let southFast = 0;
let eastFast = 0;
let westFast = 0;

// Simulation Mock Counts Configuration
const mockCounts = { north: 10, south: 6, east: 16, west: 8 };

// State Tracking
let systemMode = 'adaptive';     // 'adaptive' or 'manual'
let currentGreenRoad = 'east';   // Initial green road
let nextGreenRoad = 'north';      // Initial calculation
let signalTimerMax = 30;         // Max countdown timer duration
let countdown = 30;              // Current timer tracking remaining seconds
let isTransitioning = false;     // True when signal is transitioning (Yellow state)
let isNavigating = false;
let autoModeActive = true;       // True: System runs based on YOLO counts. False: Manual overrides
let emergencyModeActive = false; // System-wide emergency state lock
let ambulanceDetected = false;    // Global emergency check
let ambulanceRoad = null;        // Road containing the emergency vehicle
let timerInterval = null;        // Reference to main intervals

// --- Theme Switcher Logic ---
window.setTheme = function(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('traffic_theme', themeName);
    
    const selector = document.getElementById('theme-selector');
    if (selector) selector.value = themeName;
}

// Backend Integration Variables
const BACKEND_URL = 'http://127.0.0.1:5000';
let backendOnline = false;
let activeModelType = 'base'; // 'base' (pretrained COCO yolov8s.pt, highly accurate) or 'custom' (experimental custom weight best.pt)

// Webcam stream tracking for cleanup
const activeStreams = {
    north: null,
    south: null,
    east: null,
    west: null
};

// Intervals for capturing video/webcam frames to upload to backend
const activeFrameIntervals = {
    north: null,
    south: null,
    east: null,
    west: null
};

// Track if a frame upload is currently in progress for a road to prevent network queue backlog
const isFrameUploading = {
    north: false,
    south: false,
    east: false,
    west: false
};

// --- DOM Elements ---
const domCounts = {
    north: document.getElementById('count-north'),
    south: document.getElementById('count-south'),
    east: document.getElementById('count-east'),
    west: document.getElementById('count-west')
};
const domBadges = {
    north: document.getElementById('badge-north'),
    south: document.getElementById('badge-south'),
    east: document.getElementById('badge-east'),
    west: document.getElementById('badge-west')
};
const domCards = {
    north: document.getElementById('card-north'),
    south: document.getElementById('card-south'),
    east: document.getElementById('card-east'),
    west: document.getElementById('card-west')
};
const domDensities = {
    north: document.getElementById('density-north'),
    south: document.getElementById('density-south'),
    east: document.getElementById('density-east'),
    west: document.getElementById('density-west')
};

const displayGreenRoad = document.getElementById('display-green-road');
const lightRed = document.getElementById('light-red');
const lightYellow = document.getElementById('light-yellow');
const lightGreen = document.getElementById('light-green');
const signalAllocationType = document.getElementById('signal-allocation-type');

const valHighestTraffic = document.getElementById('val-highest-traffic');
const valNextGreen = document.getElementById('val-next-green');
const timerText = document.getElementById('timer-text');
const timerCircle = document.getElementById('timer-indicator-circle');

const emergencyBanner = document.getElementById('emergency-banner');
const emergencyStatus = document.getElementById('emergency-status');
const emergencyDesc = document.getElementById('emergency-desc');
const sysTimeElement = document.getElementById('sys-time');

// --- Tab Switching Logic ---
 
function switchTab(tabId) {
    // 1. Toggle navigation buttons active state
    const tabsList = ['dashboard', 'images', 'videos', 'analytics'];
    tabsList.forEach(t => {
        const btn = document.getElementById(`nav-btn-${t}`);
        if (btn) btn.classList.remove('active');
    });
    const activeNavBtn = document.getElementById(`nav-btn-${tabId}`);
    if (activeNavBtn) activeNavBtn.classList.add('active');
 
    // 2. Hide all tabs and display selected tab
    tabsList.forEach(t => {
        const tabEl = document.getElementById(`tab-${t}`);
        if (tabEl) tabEl.classList.remove('active-tab');
    });
    const activeTab = document.getElementById(`tab-${tabId}`);
    if (activeTab) activeTab.classList.add('active-tab');

    // 3. Auto-load database stats and trends if transitioning to analytics
    if (tabId === 'analytics') {
        // fetchAnalyticsDashboard(); // TODO: implement this
    }
}

// --- Core Functions ---

// Return current vehicle counts as a map
function getCounts() {
    return { north, south, east, west };
}

// Return current heavy vehicle counts as a map
function getHeavyCounts() {
    return { north: northHeavy, south: southHeavy, east: eastHeavy, west: westHeavy };
}

// Return current fast-moving vehicle counts as a map
function getFastCounts() {
    return { north: northFast, south: southFast, east: eastFast, west: westFast };
}

// Calculate and return the density class and text for a given vehicle count
function getDensityStatus(count) {
    if (count >= 15) return { text: 'HIGH', class: 'density-high' };
    if (count >= 8) return { text: 'MEDIUM', class: 'density-medium' };
    return { text: 'LOW', class: 'density-low' };
}

// Update counts and density indicators across all tabs
function updateDashboardData() {
    const counts = getCounts();
    const heavyCounts = getHeavyCounts();
    const fastCounts = getFastCounts();
    for (const road in counts) {
        const count = counts[road];
        const heavyCount = heavyCounts[road];
        const fastCount = fastCounts[road];
        
        // 1. Update Main Dashboard counts
        domCounts[road].innerHTML = `${count} <span class="unit">Vehicles</span>`;
        const heavyEl = document.getElementById(`heavy-${road}`);
        if (heavyEl) heavyEl.textContent = heavyCount;
        const fastEl = document.getElementById(`fast-${road}`);
        if (fastEl) fastEl.textContent = fastCount;
        
        // 1.5 Update specific vehicle icons (approximate from heavy/fast for UI)
        let trucks = heavyCount;
        let bikes = fastCount;
        let cars = Math.max(0, count - trucks - bikes);
        let buses = 0;
        if (trucks > 1) { buses = 1; trucks -= 1; }
        
        const carEl = document.getElementById(`car-${road}`);
        if (carEl) carEl.innerText = `🚗 ${cars}`;
        const busEl = document.getElementById(`bus-${road}`);
        if (busEl) busEl.innerText = `🚌 ${buses}`;
        const truckEl = document.getElementById(`truck-${road}`);
        if (truckEl) truckEl.innerText = `🚚 ${trucks}`;
        const bikeEl = document.getElementById(`bike-${road}`);
        if (bikeEl) bikeEl.innerText = `🏍️ ${bikes}`;

        // 1.6 Update Heatmap
        const maxCapacity = 30; // Traffic capacity assumption
        let densityPct = Math.min((count / maxCapacity) * 100, 100);
        const heatmapBar = document.getElementById(`heatmap-${road}`);
        if (heatmapBar) heatmapBar.style.width = `${densityPct}%`;

        // 2. Update Image Upload Portal counts
        const imgCount = document.getElementById(`img-count-${road}`);
        if (imgCount) imgCount.textContent = count;
        const imgHeavyEl = document.getElementById(`img-heavy-${road}`);
        if (imgHeavyEl) imgHeavyEl.textContent = heavyCount;
        const imgFastEl = document.getElementById(`img-fast-${road}`);
        if (imgFastEl) imgFastEl.textContent = fastCount;

        // 3. Update Video & Live Portal counts
        const vidCount = document.getElementById(`vid-count-${road}`);
        if (vidCount) vidCount.textContent = count;
        const vidHeavyEl = document.getElementById(`vid-heavy-${road}`);
        if (vidHeavyEl) vidHeavyEl.textContent = heavyCount;
        const vidFastEl = document.getElementById(`vid-fast-${road}`);
        if (vidFastEl) vidFastEl.textContent = fastCount;
        
        // Density class updates
        const status = getDensityStatus(count);
        
        // Main Dashboard density badge
        domDensities[road].textContent = status.text;
        domDensities[road].className = `density-badge ${status.class}`;

        // Image Portal density badge
        const imgDensity = document.getElementById(`img-density-${road}`);
        if (imgDensity) {
            imgDensity.textContent = status.text;
            imgDensity.className = `density-badge ${status.class}`;
        }

        // Video Portal density badge
        const vidDensity = document.getElementById(`vid-density-${road}`);
        if (vidDensity) {
            vidDensity.textContent = status.text;
            vidDensity.className = `density-badge ${status.class}`;
        }
    }
}

// Calculate highest traffic road and the next road that should be green
function recalculateSignals() {
    if (ambulanceDetected) {
        valHighestTraffic.textContent = `${ambulanceRoad.toUpperCase()} ROAD`;
        valNextGreen.textContent = `${ambulanceRoad.toUpperCase()} ROAD`;
        return;
    }

    const counts = getCounts();
    
    // Find road with highest vehicle count
    let maxCount = -1;
    let highestRoad = '';
    
    for (const road in counts) {
        if (counts[road] > maxCount) {
            maxCount = counts[road];
            highestRoad = road;
        }
    }

    valHighestTraffic.textContent = `${highestRoad.toUpperCase()} ROAD`;

    // Next Green Calculation
    // If the highest road is NOT the current green road, it is our candidate.
    // If it IS currently green, find the second highest road to plan the rotation.
    if (highestRoad !== currentGreenRoad) {
        nextGreenRoad = highestRoad;
    } else {
        let secondMax = -1;
        let secondHighest = currentGreenRoad; // default fallback
        for (const road in counts) {
            if (road !== currentGreenRoad && counts[road] > secondMax) {
                secondMax = counts[road];
                secondHighest = road;
            }
        }
        nextGreenRoad = secondHighest;
    }

    valNextGreen.textContent = `${nextGreenRoad.toUpperCase()} ROAD`;
}

// Apply Red/Yellow/Green UI styles and lights based on signal states
function updateSignalUI(overrideState = null) {
    const activeRoad = overrideState || currentGreenRoad;
    const counts = getCounts();

    // Set central label text
    displayGreenRoad.textContent = `${activeRoad.toUpperCase()} ROAD`;
    
    // Reset text highlight styling
    displayGreenRoad.className = 'active-road-display';
    if (ambulanceDetected) {
        displayGreenRoad.classList.add('emergency-override');
        signalAllocationType.textContent = 'EMERGENCY OVERRIDE';
        signalAllocationType.style.color = 'var(--signal-red)';
    } else if (systemMode === 'manual') {
        displayGreenRoad.classList.add('yellow-active');
        signalAllocationType.textContent = 'MANUAL OVERRIDE';
        signalAllocationType.style.color = 'var(--signal-yellow)';
    } else if (isTransitioning) {
        displayGreenRoad.classList.add('yellow-active');
        signalAllocationType.textContent = 'ADAPTIVE';
        signalAllocationType.style.color = 'var(--signal-green)';
    } else {
        displayGreenRoad.classList.add('green-active');
        signalAllocationType.textContent = 'ADAPTIVE';
        signalAllocationType.style.color = 'var(--signal-green)';
    }

    // Set AI Decision Panel Text
    const decisionPanel = document.getElementById('ai-decision-panel');
    if (decisionPanel) {
        if (ambulanceDetected) {
            decisionPanel.innerHTML = `[AI ALERT] EMERGENCY DETECTED<br>> AMBULANCE ON ${activeRoad.toUpperCase()} ROAD<br>> PREEMPTING SIGNAL STATE`;
            decisionPanel.classList.add('emergency-mode');
        } else if (systemMode === 'manual') {
            decisionPanel.innerHTML = `[SYS] MANUAL OVERRIDE ENGAGED<br>> ADAPTIVE AI SUSPENDED<br>> ${activeRoad.toUpperCase()} SIGNAL FORCED`;
            decisionPanel.classList.remove('emergency-mode');
        } else if (isTransitioning) {
            decisionPanel.innerHTML = `[AI] SHIFTING FLOW DYNAMICS<br>> CLEARING INTERSECTION<br>> PREPARING ${nextGreenRoad.toUpperCase()} ROAD`;
            decisionPanel.classList.remove('emergency-mode');
        } else {
            decisionPanel.innerHTML = `[AI] MAX DENSITY ROUTING<br>> ${activeRoad.toUpperCase()} DETECTED HIGHEST VOLUME<br>> OPTIMIZING TRAFFIC FLOW`;
            decisionPanel.classList.remove('emergency-mode');
        }
    }

    // Set physical lights status
    lightRed.classList.remove('active');
    lightYellow.classList.remove('active');
    lightGreen.classList.remove('active');

    if (ambulanceDetected) {
        lightGreen.classList.add('active'); // Ambulance always gets green
    } else if (isTransitioning) {
        lightYellow.classList.add('active');
    } else {
        lightGreen.classList.add('active');
    }

    // Update all individual road status cards and portals
    for (const road in counts) {
        const card = domCards[road];
        const badge = domBadges[road];
        
        // Sync portal sub-badges
        const imgBadge = document.getElementById(`img-badge-${road}`);
        const vidBadge = document.getElementById(`vid-badge-${road}`);

        card.classList.remove('state-green', 'state-yellow', 'state-red');
        badge.classList.remove('badge-green', 'badge-yellow', 'badge-red');
        if (imgBadge) imgBadge.classList.remove('badge-green', 'badge-yellow', 'badge-red');
        if (vidBadge) vidBadge.classList.remove('badge-green', 'badge-yellow', 'badge-red');

        if (ambulanceDetected) {
            if (road === ambulanceRoad) {
                card.classList.add('state-green');
                badge.classList.add('badge-green');
                badge.textContent = '🟢 GREEN (EMG)';
                if (imgBadge) { imgBadge.classList.add('badge-green'); imgBadge.textContent = '🟢 GREEN (EMG)'; }
                if (vidBadge) { vidBadge.classList.add('badge-green'); vidBadge.textContent = '🟢 GREEN (EMG)'; }
            } else {
                card.classList.add('state-red');
                badge.classList.add('badge-red');
                badge.textContent = '🔴 RED';
                if (imgBadge) { imgBadge.classList.add('badge-red'); imgBadge.textContent = '🔴 RED'; }
                if (vidBadge) { vidBadge.classList.add('badge-red'); vidBadge.textContent = '🔴 RED'; }
            }
        } else if (road === currentGreenRoad) {
            if (isTransitioning) {
                card.classList.add('state-yellow');
                badge.classList.add('badge-yellow');
                badge.textContent = '🟡 YELLOW';
                if (imgBadge) { imgBadge.classList.add('badge-yellow'); imgBadge.textContent = '🟡 YELLOW'; }
                if (vidBadge) { vidBadge.classList.add('badge-yellow'); vidBadge.textContent = '🟡 YELLOW'; }
            } else {
                card.classList.add('state-green');
                badge.classList.add('badge-green');
                badge.textContent = '🟢 GREEN';
                if (imgBadge) { imgBadge.classList.add('badge-green'); imgBadge.textContent = '🟢 GREEN'; }
                if (vidBadge) { vidBadge.classList.add('badge-green'); vidBadge.textContent = '🟢 GREEN'; }
            }
        } else {
            card.classList.add('state-red');
            badge.classList.add('badge-red');
            badge.textContent = '🔴 RED';
            if (imgBadge) { imgBadge.classList.add('badge-red'); imgBadge.textContent = '🔴 RED'; }
            if (vidBadge) { vidBadge.classList.add('badge-red'); vidBadge.textContent = '🔴 RED'; }
        }
    }

    // Sync button states
    updateManualControlButtonsState();
}

// --- Operating Mode Toggle Logic ---

function setSystemMode(mode) {
    systemMode = mode;
    
    // Toggle active classes on mode selector buttons
    const btnAdaptive = document.getElementById('btn-mode-adaptive');
    const btnManual = document.getElementById('btn-mode-manual');
    
    if (systemMode === 'adaptive') {
        btnAdaptive.classList.add('active');
        btnManual.classList.remove('active');
        
        // Reset countdown timer
        isTransitioning = false;
        countdown = signalTimerMax;
        
        recalculateSignals();
        updateSignalUI();
    } else {
        btnAdaptive.classList.remove('active');
        btnManual.classList.add('active');
        
        // Cancel yellow transition and freeze
        isTransitioning = false;
        updateSignalUI();
    }
    
    updateTimerCircle();
}

// Toggle disable properties and active class indicators for manual signals
function updateManualControlButtonsState() {
    const roads = ['north', 'south', 'east', 'west'];
    roads.forEach(road => {
        const btn = document.getElementById(`btn-man-${road}`);
        if (btn) {
            if (systemMode === 'manual' && !ambulanceDetected) {
                btn.removeAttribute('disabled');
                if (road === currentGreenRoad) {
                    btn.classList.add('active-green');
                } else {
                    btn.classList.remove('active-green');
                }
            } else {
                btn.setAttribute('disabled', 'true');
                btn.classList.remove('active-green');
            }
        }
    });
}

// Manually trigger a road signal green (only works when systemMode is 'manual')
function manualSignalOverride(road) {
    if (systemMode !== 'manual' || ambulanceDetected) return;
    
    currentGreenRoad = road;
    nextGreenRoad = road; // Keep next road aligned
    isTransitioning = false;
    
    updateSignalUI();
}

// --- Ambulance Override Control Room Logic ---

function triggerAmbulance(road) {
    ambulanceDetected = true;
    ambulanceRoad = road;

    // Highlight the active button in the simulator panel
    document.querySelectorAll('.btn-amb-dir').forEach(btn => {
        btn.classList.remove('override-active');
    });
    const activeBtn = document.getElementById(`btn-amb-${road}`);
    if (activeBtn) activeBtn.classList.add('override-active');

    // Apply emergency override visual card states
    emergencyBanner.classList.add('emergency-active');
    emergencyStatus.className = 'emergency-status-text active-emergency';
    emergencyStatus.textContent = 'AMBULANCE DETECTED';
    
    emergencyDesc.innerHTML = `
        <span class="highlight">EMERGENCY PRIORITY ACTIVE</span><br>
        <span>GREEN SIGNAL OVERRIDE IN EFFECT FOR <strong>${road.toUpperCase()} ROAD</strong></span>
    `;
    
    // Recalculate and update UI immediately
    recalculateSignals();
    updateSignalUI();
    
    // Adjust timer state visually
    countdown = signalTimerMax;
    updateTimerCircle();
}

function clearAmbulance() {
    if (!ambulanceDetected) return;

    ambulanceDetected = false;
    ambulanceRoad = null;

    // Clear panel button highlights
    document.querySelectorAll('.btn-amb-dir').forEach(btn => {
        btn.classList.remove('override-active');
    });

    // Restore emergency card text
    emergencyBanner.classList.remove('emergency-active');
    emergencyStatus.className = 'emergency-status-text no-emergency';
    emergencyStatus.textContent = 'NO AMBULANCE DETECTED';
    emergencyDesc.textContent = 'System monitoring active for emergency transponders. Automatic override is currently idle.';

    // Reset transition variables and trigger standard calculation
    isTransitioning = false;
    countdown = signalTimerMax;
    
    recalculateSignals();
    updateSignalUI();
    updateTimerCircle();
}

// --- Core Timer & Signal Controller ---

function updateTimerCircle() {
    // If in manual mode, pause countdown display and show "MAN"
    if (systemMode === 'manual' && !ambulanceDetected) {
        timerText.textContent = "MAN";
        timerCircle.style.strokeDashoffset = 0;
        timerCircle.style.stroke = 'var(--signal-yellow)';
        return;
    }

    timerText.textContent = countdown;
    
    // SVG circular progress calculation
    const radius = 54;
    const circumference = 2 * Math.PI * radius; // 339.292
    
    let offset;
    if (ambulanceDetected) {
        // Flash timer at 0 or full in emergency mode
        offset = 0;
        timerCircle.style.stroke = 'var(--signal-red)';
    } else if (isTransitioning) {
        // Progress representing yellow transition (3 seconds max)
        const percent = (countdown / 3);
        offset = circumference - (percent * circumference);
        timerCircle.style.stroke = 'var(--signal-yellow)';
    } else {
        const percent = (countdown / signalTimerMax);
        offset = circumference - (percent * circumference);
        timerCircle.style.stroke = 'var(--accent-cyan)';
    }
    
    timerCircle.style.strokeDashoffset = offset;
}

function startSignalController() {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        // If emergency is active, freeze the normal traffic light cycle and just pulse the visual clock
        if (ambulanceDetected) {
            countdown = 0;
            updateTimerCircle();
            return;
        }

        // If in manual override mode, timer ticks are suspended
        if (systemMode === 'manual') {
            updateTimerCircle();
            return;
        }

        countdown--;

        // Yellow Transition Stage
        // If countdown hits 3 seconds, trigger yellow warning phase
        if (countdown === 3 && !isTransitioning) {
            isTransitioning = true;
            // Determine where we will go green next
            recalculateSignals();
            updateSignalUI();
        }

        // Cycle Complete
        if (countdown < 0) {
            isTransitioning = false;
            
            // The planned next road officially gets green signal
            currentGreenRoad = nextGreenRoad;
            
            // Reset timer count
            countdown = signalTimerMax;
            
            // Recalculate next path and update dashboard
            recalculateSignals();
            updateSignalUI();
        }

        updateTimerCircle();

    }, 1000); // 1-second ticks
}

// Helper: Format Time Clock
function updateSystemClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    sysTimeElement.textContent = `${hours}:${minutes}:${seconds}`;
}

// --- Backend Connection Scanning ---

function updateEngineDisplay(backendData) {
    const engineValue = document.getElementById('ai-engine-value');
    if (!engineValue) return;

    if (!backendOnline) {
        engineValue.textContent = "YOLOv8s (SIM)";
        return;
    }

    if (activeModelType === 'base') {
        engineValue.textContent = "COCO (yolov8s.pt)";
    } else {
        if (backendData && backendData.model_loaded) {
            engineValue.textContent = `CUSTOM (${backendData.model_loaded})`;
        } else {
            engineValue.textContent = "CUSTOM (best.pt)";
        }
    }
}

function checkBackendStatus() {
    fetch(`${BACKEND_URL}/`)
        .then(response => response.json())
        .then(data => {
            if (data.status === "online") {
                backendOnline = true;
                updateEngineDisplay(data);
                console.log("[*] Backend is online! Local model loaded:", data.model_loaded);
            }
        })
        .catch(err => {
            backendOnline = false;
            updateEngineDisplay(null);
            console.log("[*] Backend is offline. Running in local simulation mode.");
        });
}

function setInferenceModel(modelType) {
    activeModelType = modelType;
    
    const btnBase = document.getElementById('btn-model-base');
    const btnCustom = document.getElementById('btn-model-custom');
    
    if (activeModelType === 'base') {
        if (btnBase) btnBase.classList.add('active');
        if (btnCustom) btnCustom.classList.remove('active');
    } else {
        if (btnBase) btnBase.classList.remove('active');
        if (btnCustom) btnCustom.classList.add('active');
    }
    
    checkBackendStatus();
}

// --- Camera, Photo, & Live Feed Integration ---

// Smart routing to trigger file inputs on the active tab page
function triggerVideoUpload(road) {
    const vidInput = document.getElementById(`file-video-vid-${road}`);
    const dashInput = document.getElementById(`file-video-${road}`);
    if (vidInput && document.getElementById('tab-videos').classList.contains('active-tab')) {
        vidInput.click();
    } else if (dashInput) {
        dashInput.click();
    }
}

function triggerPhotoUpload(road) {
    const imgInput = document.getElementById(`file-photo-img-${road}`);
    const dashInput = document.getElementById(`file-photo-${road}`);
    if (imgInput && document.getElementById('tab-images').classList.contains('active-tab')) {
        imgInput.click();
    } else if (dashInput) {
        dashInput.click();
    }
}

// Start device webcam and stream live on both dashboard and video portal
function startLiveFeed(road, chosenDeviceId = null) {
    cleanupRoadMedia(road);

    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            console.log(`[*] Detected ${videoDevices.length} video input devices.`);
            
            let constraints = { video: true };
            let selectedDevice = null;
            
            if (videoDevices.length > 0) {
                if (chosenDeviceId) {
                    selectedDevice = videoDevices.find(d => d.deviceId === chosenDeviceId);
                }
                
                if (!selectedDevice) {
                    // Automatically assign physical camera based on road index
                    const roadIndices = { 'north': 0, 'south': 1, 'east': 2, 'west': 3 };
                    const targetIndex = roadIndices[road] || 0;
                    const deviceIndex = targetIndex < videoDevices.length ? targetIndex : 0;
                    selectedDevice = videoDevices[deviceIndex];
                }
                
                if (selectedDevice) {
                    console.log(`[*] Road ${road.toUpperCase()} starting stream using camera: ${selectedDevice.label || 'Unnamed Device'}`);
                    constraints = {
                        video: {
                            deviceId: selectedDevice.deviceId
                        }
                    };
                }
            }
            
            return navigator.mediaDevices.getUserMedia(constraints)
                .then(stream => {
                    activeStreams[road] = stream;

                    const dashVid = document.getElementById(`video-${road}`);
                    const portalVid = document.getElementById(`vid-video-${road}`);

                    // Deactivate images
                    const dashImg = document.getElementById(`image-${road}`);
                    const portalImg = document.getElementById(`image-img-${road}`);
                    if (dashImg) { dashImg.classList.remove('active-image'); dashImg.src = ''; }
                    if (portalImg) { portalImg.classList.remove('active-image'); portalImg.src = ''; }

                    // Bind stream to Dashboard Video Player
                    if (dashVid) {
                        dashVid.src = '';
                        dashVid.srcObject = stream;
                        dashVid.classList.add('active-video');
                    }

                    // Bind stream to Video Portal Video Player
                    if (portalVid) {
                        portalVid.src = '';
                        portalVid.srcObject = stream;
                        portalVid.classList.add('active-video');
                    }

                    // Show overlays and placeholders on both tabs
                    const dashFeed = document.getElementById(`feed-container-${road}`);
                    const portalFeed = document.getElementById(`vid-feed-container-${road}`);
                    if (dashFeed) dashFeed.classList.add('has-video');
                    if (portalFeed) portalFeed.classList.add('has-video');

                    const dashPlaceholder = document.getElementById(`placeholder-${road}`);
                    const portalPlaceholder = document.getElementById(`vid-placeholder-${road}`);
                    if (dashPlaceholder) dashPlaceholder.style.display = 'none';
                    if (portalPlaceholder) portalPlaceholder.style.display = 'none';

                    // Start feed with 0 count until backend responds (if backend is online)
                    const count = backendOnline ? 0 : mockCounts[road];
                    const heavyCount = backendOnline ? 0 : Math.floor(count * 0.15);
                    const fastCount = backendOnline ? 0 : Math.floor(count * 0.25);
                    updateRoadVehicleCount(road, count, heavyCount, fastCount, 'video');

                    // Play stream elements simultaneously
                    if (dashVid) dashVid.play().catch(err => console.warn(err));
                    if (portalVid) portalVid.play().catch(err => console.warn(err));

                    // Start sending frames to python backend
                    startFrameCaptureLoop(road);

                    // If multiple video inputs exist, render a premium real-time camera switcher dropdown
                    if (videoDevices.length > 1) {
                        renderLiveCameraSelector(road, videoDevices, selectedDevice ? selectedDevice.deviceId : null);
                    }
                });
        })
        .catch(err => {
            console.error("Camera access error:", err);
            alert("Error accessing webcam: " + err.name + "\n\nSince no camera was found or permission was denied, we will now open the file picker so you can select a traffic video file to simulate the Live stream instead!");
            triggerVideoUpload(road);
        });
}

// Render dynamic glassmorphic camera select dropdown inside live stream
function renderLiveCameraSelector(road, devices, activeDeviceId) {
    const classTag = `cam-selector-overlay-${road}`;
    
    // Remove existing ones first to prevent duplicate overlays on device swap
    document.querySelectorAll(`.${classTag}`).forEach(el => el.remove());
    
    // Create new element
    const container = document.createElement('div');
    container.className = `live-camera-selector-overlay ${classTag}`;
    
    // Find active feed containers
    const dashFeed = document.getElementById(`feed-container-${road}`);
    const portalFeed = document.getElementById(`vid-feed-container-${road}`);
    
    if (dashFeed) {
        const dashClone = container.cloneNode(true);
        dashClone.innerHTML = buildSelectorHTML(road, devices, activeDeviceId);
        dashFeed.appendChild(dashClone);
    }
    if (portalFeed) {
        const portalClone = container.cloneNode(true);
        portalClone.innerHTML = buildSelectorHTML(road, devices, activeDeviceId);
        portalFeed.appendChild(portalClone);
    }
}

function buildSelectorHTML(road, devices, activeDeviceId) {
    let options = '';
    devices.forEach((dev, idx) => {
        const label = dev.label || `Camera ${idx + 1}`;
        const selected = dev.deviceId === activeDeviceId ? 'selected' : '';
        options += `<option value="${dev.deviceId}" ${selected}>${label.slice(0, 18)}</option>`;
    });
    
    return `
        <div class="cam-select-wrap">
            <span class="cam-select-icon">🎥</span>
            <select class="cam-device-select" data-road="${road}" onchange="switchLiveCamera('${road}', this.value)">
                ${options}
            </select>
        </div>
    `;
}

function switchLiveCamera(road, deviceId) {
    console.log(`[*] Switching live feed for ${road.toUpperCase()} to camera ID: ${deviceId}`);
    startLiveFeed(road, deviceId);
}

// Handle video selection (rendering on both dashboard and video portal simultaneously)
function handleVideoSelected(road, event) {
    const file = event.target.files[0];
    if (file) {
        cleanupRoadMedia(road);

        const videoUrl = URL.createObjectURL(file);
        
        const dashVid = document.getElementById(`video-${road}`);
        const portalVid = document.getElementById(`vid-video-${road}`);

        const dashImg = document.getElementById(`image-${road}`);
        const portalImg = document.getElementById(`image-img-${road}`);
        if (dashImg) { dashImg.classList.remove('active-image'); dashImg.src = ''; }
        if (portalImg) { portalImg.classList.remove('active-image'); portalImg.src = ''; }

        // Bind source to both
        if (dashVid) {
            dashVid.srcObject = null;
            dashVid.src = videoUrl;
            dashVid.classList.add('active-video');
        }
        if (portalVid) {
            portalVid.srcObject = null;
            portalVid.src = videoUrl;
            portalVid.classList.add('active-video');
        }

        const dashFeed = document.getElementById(`feed-container-${road}`);
        const portalFeed = document.getElementById(`vid-feed-container-${road}`);
        if (dashFeed) dashFeed.classList.add('has-video');
        if (portalFeed) portalFeed.classList.add('has-video');

        const dashPlaceholder = document.getElementById(`placeholder-${road}`);
        const portalPlaceholder = document.getElementById(`vid-placeholder-${road}`);
        if (dashPlaceholder) dashPlaceholder.style.display = 'none';
        if (portalPlaceholder) portalPlaceholder.style.display = 'none';

        // Start feed with 0 count until backend responds (if backend is online)
        const count = backendOnline ? 0 : mockCounts[road];
        const heavyCount = backendOnline ? 0 : Math.floor(count * 0.18);
        const fastCount = backendOnline ? 0 : Math.floor(count * 0.22);
        updateRoadVehicleCount(road, count, heavyCount, fastCount, 'video');

        // Play streams together
        if (dashVid) {
            dashVid.load();
            dashVid.play().catch(err => console.warn(err));
        }
        if (portalVid) {
            portalVid.load();
            portalVid.play().catch(err => console.warn(err));
        }

        // Start sending frames to python backend
        startFrameCaptureLoop(road);

        // Upload video file to backend for deep frame-by-frame analytics
        uploadVideoFile(road, file);
    }
    // Clear input value to allow uploading the same file multiple times consecutively
    event.target.value = '';
}

// Handle photo selection (rendering on both dashboard and image portal simultaneously)
function handlePhotoSelected(road, event) {
    const file = event.target.files[0];
    if (file) {
        cleanupRoadMedia(road);

        const imageUrl = URL.createObjectURL(file);
        
        const dashVid = document.getElementById(`video-${road}`);
        const portalVid = document.getElementById(`vid-video-${road}`);

        if (dashVid) {
            dashVid.pause();
            dashVid.classList.remove('active-video');
            dashVid.src = '';
            dashVid.srcObject = null;
            dashVid.load();
        }
        if (portalVid) {
            portalVid.pause();
            portalVid.classList.remove('active-video');
            portalVid.src = '';
            portalVid.srcObject = null;
            portalVid.load();
        }

        const dashImg = document.getElementById(`image-${road}`);
        const portalImg = document.getElementById(`image-img-${road}`);
        
        if (dashImg) {
            dashImg.src = imageUrl;
            dashImg.classList.add('active-image');
        }
        if (portalImg) {
            portalImg.src = imageUrl;
            portalImg.classList.add('active-image');
        }

        const dashFeed = document.getElementById(`feed-container-${road}`);
        const imgFeed = document.getElementById(`img-feed-container-${road}`);
        if (dashFeed) dashFeed.classList.add('has-video');
        if (imgFeed) imgFeed.classList.add('has-video');

        const dashPlaceholder = document.getElementById(`placeholder-${road}`);
        const imgPlaceholder = document.getElementById(`img-placeholder-${road}`);
        if (dashPlaceholder) dashPlaceholder.style.display = 'none';
        if (imgPlaceholder) imgPlaceholder.style.display = 'none';

        // Upload photo to Python server
        uploadPhotoFile(road, file);
    }
    // Clear input value to allow uploading the same file multiple times consecutively
    event.target.value = '';
}

// Upload a static photo to the backend server
function uploadPhotoFile(road, file) {
    if (!backendOnline) {
        // Falling back to local simulation
        const mockCounts = { north: 10, south: 6, east: 16, west: 8 };
        const count = mockCounts[road];
        const heavyCount = Math.floor(count * 0.2);
        const fastCount = Math.floor(count * 0.3);
        updateRoadVehicleCount(road, count, heavyCount, fastCount, 'image');
        return;
    }

    const formData = new FormData();
    formData.append('image', file);
    formData.append('road', road);
    formData.append('model_type', activeModelType);

    fetch(`${BACKEND_URL}/detect/image`, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.predictions) {
            renderBackendPredictions(road, data, 'image');
        }
    })
    .catch(err => {
        console.error("[!] Photo upload inference error: ", err);
        // Fallback to local mock on failure
        const mockCounts = { north: 10, south: 6, east: 16, west: 8 };
        const count = mockCounts[road];
        const heavyCount = Math.floor(count * 0.2);
        const fastCount = Math.floor(count * 0.3);
        updateRoadVehicleCount(road, count, heavyCount, fastCount, 'image');
    });
}

// Start frame capturing intervals for active video elements
function startFrameCaptureLoop(road) {
    if (activeFrameIntervals[road]) clearInterval(activeFrameIntervals[road]);

    activeFrameIntervals[road] = setInterval(() => {
        const dashFeed = document.getElementById(`feed-container-${road}`);
        const vidFeed = document.getElementById(`vid-feed-container-${road}`);
        const hasVideo = (dashFeed && dashFeed.classList.contains('has-video')) || 
                           (vidFeed && vidFeed.classList.contains('has-video'));

        if (!hasVideo) {
            stopFrameCaptureLoop(road);
            return;
        }

        const videoElement = document.getElementById(`video-${road}`);
        const portalVid = document.getElementById(`vid-video-${road}`);
        
        // Select whichever element is active/configured
        const activeVid = (videoElement && videoElement.classList.contains('active-video') && (videoElement.srcObject || videoElement.src)) ? videoElement : portalVid;

        if (activeVid && !activeVid.paused && !activeVid.ended) {
            captureAndUploadFrame(road, activeVid);
        }
    }, 1500); // 1.5 seconds intervals
}

function stopFrameCaptureLoop(road) {
    if (activeFrameIntervals[road]) {
        clearInterval(activeFrameIntervals[road]);
        activeFrameIntervals[road] = null;
    }
}

// Convert canvas capture to JPEG Blob and POST to backend
function captureAndUploadFrame(road, videoElement) {
    if (!backendOnline) return;
    
    // Prevent network queue backlog if backend is slow/busy
    if (isFrameUploading[road]) return;

    isFrameUploading[road] = true;

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 320;
    canvas.height = videoElement.videoHeight || 240;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
        if (!blob) {
            isFrameUploading[road] = false;
            return;
        }

        const formData = new FormData();
        formData.append('image', blob, 'frame.jpg');
        formData.append('road', road);
        formData.append('model_type', activeModelType);

        fetch(`${BACKEND_URL}/detect/image`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            isFrameUploading[road] = false;
            if (data.predictions) {
                renderBackendPredictions(road, data, 'video');
            }
        })
        .catch(err => {
            isFrameUploading[road] = false;
            console.error("[!] Frame upload inference error: ", err);
        });
    }, 'image/jpeg', 0.7); // 70% quality compression
}

// Update local state variables, trigger UI updates, and render YOLO bounding boxes (local mock)
function updateRoadVehicleCount(road, count, heavyCount, fastCount, type) {
    if (road === 'north') { north = count; northHeavy = heavyCount; northFast = fastCount; }
    if (road === 'south') { south = count; southHeavy = heavyCount; southFast = fastCount; }
    if (road === 'east') { east = count; eastHeavy = heavyCount; eastFast = fastCount; }
    if (road === 'west') { west = count; westHeavy = heavyCount; westFast = fastCount; }

    updateDashboardData();
    recalculateSignals();
    updateSignalUI();

    // ONLY draw mock detections if we are running in local simulation (offline) mode
    if (!backendOnline) {
        showYoloDetections(road, count, heavyCount, fastCount, type);
    }
}

// Parse coordinates from python server, convert center mapping, and draw dual boxes on overlays
function renderBackendPredictions(road, data, type) {
    const count = data.predictions.length;
    let heavyCount = 0;
    let fastCount = 0;
    const heavyClasses = ['truck', 'bus', 'heavy vehicle', 'container', 'lorry'];
    data.predictions.forEach(pred => {
        if (pred.class && heavyClasses.includes(pred.class.toLowerCase())) {
            heavyCount++;
        }
        if (pred.fast_moving) {
            fastCount++;
        }
    });

    if (road === 'north') { north = count; northHeavy = heavyCount; northFast = fastCount; }
    if (road === 'south') { south = count; southHeavy = heavyCount; southFast = fastCount; }
    if (road === 'east') { east = count; eastHeavy = heavyCount; eastFast = fastCount; }
    if (road === 'west') { west = count; westHeavy = heavyCount; westFast = fastCount; }

    updateDashboardData();
    recalculateSignals();
    updateSignalUI();

    // Automatic emergency ambulance detection override has been disabled.
    // The user must now manually trigger ambulance overrides via the dashboard UI.

    const dashOverlay = document.getElementById(`overlay-${road}`);
    const imgOverlay = document.getElementById(`img-overlay-${road}`);
    const vidOverlay = document.getElementById(`vid-overlay-${road}`);

    if (dashOverlay) { dashOverlay.innerHTML = ''; dashOverlay.classList.remove('active-overlay'); }
    if (imgOverlay) { imgOverlay.innerHTML = ''; imgOverlay.classList.remove('active-overlay'); }
    if (vidOverlay) { vidOverlay.innerHTML = ''; vidOverlay.classList.remove('active-overlay'); }

    const activeOverlays = [];
    if (dashOverlay) activeOverlays.push(dashOverlay);
    if (type === 'image' && imgOverlay) activeOverlays.push(imgOverlay);
    if (type === 'video' && vidOverlay) activeOverlays.push(vidOverlay);

    // Read raw dimensions
    const imgWidth = data.image ? data.image.width : 640;
    const imgHeight = data.image ? data.image.height : 480;

    activeOverlays.forEach(overlay => {
        overlay.classList.add('active-overlay');

        const badge = document.createElement('div');
        badge.className = 'yolo-badge';
        badge.textContent = `LOCAL YOLO: ${count} DETECTED (HEAVY: ${heavyCount}) (FAST: ${fastCount})`;
        overlay.appendChild(badge);

        data.predictions.forEach(pred => {
            const box = document.createElement('div');
            box.className = 'yolo-box';

            // Roboflow returns x, y as center coordinates in pixels.
            // Convert to percentage values relative to image width/height.
            const boxWidthPercent = (pred.width / imgWidth) * 100;
            const boxHeightPercent = (pred.height / imgHeight) * 100;
            const leftPercent = ((pred.x - pred.width / 2) / imgWidth) * 100;
            const topPercent = ((pred.y - pred.height / 2) / imgHeight) * 100;

            box.style.left = `${Math.max(0, Math.min(100, leftPercent))}%`;
            box.style.top = `${Math.max(0, Math.min(100, topPercent))}%`;
            box.style.width = `${Math.max(0, Math.min(100, boxWidthPercent))}%`;
            box.style.height = `${Math.max(0, Math.min(100, boxHeightPercent))}%`;

            const label = (pred.class || "vehicle") + (pred.fast_moving ? " [FAST]" : "");
            const confidence = pred.confidence ? pred.confidence.toFixed(2) : "0.85";

            box.textContent = `${label} ${confidence}`;
            overlay.appendChild(box);
        });
    });
}

// Render dynamic simulated bounding boxes over both active dashboard and portal overlays simultaneously (Mock)
function showYoloDetections(road, count, heavyCount, fastCount, type) {
    const dashOverlay = document.getElementById(`overlay-${road}`);
    const imgOverlay = document.getElementById(`img-overlay-${road}`);
    const vidOverlay = document.getElementById(`vid-overlay-${road}`);

    // Clear all
    if (dashOverlay) { dashOverlay.innerHTML = ''; dashOverlay.classList.remove('active-overlay'); }
    if (imgOverlay) { imgOverlay.innerHTML = ''; imgOverlay.classList.remove('active-overlay'); }
    if (vidOverlay) { vidOverlay.innerHTML = ''; vidOverlay.classList.remove('active-overlay'); }

    // Overlays to draw on
    const activeOverlays = [];
    if (type !== 'none') {
        if (dashOverlay) activeOverlays.push(dashOverlay);
        if (type === 'image' && imgOverlay) activeOverlays.push(imgOverlay);
        if (type === 'video' && vidOverlay) activeOverlays.push(vidOverlay);
    }

    activeOverlays.forEach(overlay => {
        overlay.classList.add('active-overlay');

        // Create YOLO engine identification badge
        const badge = document.createElement('div');
        badge.className = 'yolo-badge';
        badge.textContent = `YOLOv8s: ${count} DETECTED (HEAVY: ${heavyCount || 0}) (FAST: ${fastCount || 0})`;
        overlay.appendChild(badge);

        const heavyClasses = ['bus', 'truck'];
        let heavyDrawn = 0;
        let fastDrawn = 0;

        // Generate bounding boxes matching the counts
        for (let i = 0; i < count; i++) {
            const box = document.createElement('div');
            box.className = 'yolo-box';

            // Position mock boxes along structured traffic lanes to resemble real queuing
            const lane = i % 2; // Split into 2 lanes
            const numInLane = Math.floor(i / 2);
            
            const width = 16 + (i % 3) * 2;   // 16% to 20% wide
            const height = 12 + (i % 2) * 2;  // 12% to 14% tall
            
            // Lane X coordinates: lane 0 on left side, lane 1 on right side
            const left = lane === 0 ? (20 + (i % 3) * 2) : (60 + (i % 3) * 2);
            
            // Queue Y coordinates: stack from bottom of feed (~70%) upwards
            const top = Math.max(10, 70 - (numInLane * 18) - (i % 2) * 2);

            box.style.left = `${left}%`;
            box.style.top = `${top}%`;
            box.style.width = `${width}%`;
            box.style.height = `${height}%`;

            // Pick a class and confidence score based on heavyCount
            let vClass;
            if (heavyDrawn < (heavyCount || 0)) {
                vClass = heavyClasses[Math.floor(Math.random() * heavyClasses.length)];
                heavyDrawn++;
            } else {
                const lightClasses = ['car', 'motorcycle', 'bicycle'];
                vClass = lightClasses[Math.floor(Math.random() * lightClasses.length)];
            }
            
            // Check if fast moving
            let isFast = false;
            if (fastDrawn < (fastCount || 0)) {
                isFast = true;
                fastDrawn++;
            }
            
            const confidence = (Math.random() * 0.15 + 0.80).toFixed(2); // 80% to 95%

            box.textContent = `${vClass}${isFast ? " [FAST]" : ""} ${confidence}`;
            overlay.appendChild(box);
        }
    });
}

// Clean up all active tracks, players, and reset overlays on dashboard and portals
function cleanupRoadMedia(road) {
    // 1. Stop video capturing intervals
    stopFrameCaptureLoop(road);

    // 2. Stop webcam stream if active
    if (activeStreams[road]) {
        activeStreams[road].getTracks().forEach(track => track.stop());
        activeStreams[road] = null;
    }

    // 3. Stop and clear video elements
    const dashVid = document.getElementById(`video-${road}`);
    if (dashVid) {
        dashVid.pause();
        dashVid.src = '';
        dashVid.srcObject = null;
        dashVid.classList.remove('active-video');
        dashVid.load();
    }
    const portalVid = document.getElementById(`vid-video-${road}`);
    if (portalVid) {
        portalVid.pause();
        portalVid.src = '';
        portalVid.srcObject = null;
        portalVid.classList.remove('active-video');
        portalVid.load();
    }

    // 4. Clear image elements
    const dashImg = document.getElementById(`image-${road}`);
    if (dashImg) {
        dashImg.src = '';
        dashImg.classList.remove('active-image');
    }
    const portalImg = document.getElementById(`image-img-${road}`);
    if (portalImg) {
        portalImg.src = '';
        portalImg.classList.remove('active-image');
    }

    // 5. Clear all overlay divs
    const dashOverlay = document.getElementById(`overlay-${road}`);
    if (dashOverlay) {
        dashOverlay.innerHTML = '';
        dashOverlay.classList.remove('active-overlay');
    }
    const imgOverlay = document.getElementById(`img-overlay-${road}`);
    if (imgOverlay) {
        imgOverlay.innerHTML = '';
        imgOverlay.classList.remove('active-overlay');
    }
    const vidOverlay = document.getElementById(`vid-overlay-${road}`);
    if (vidOverlay) {
        vidOverlay.innerHTML = '';
        vidOverlay.classList.remove('active-overlay');
    }

    // 6. Restore placeholders and remove styling classes
    const dashPlaceholder = document.getElementById(`placeholder-${road}`);
    if (dashPlaceholder) dashPlaceholder.style.display = 'flex';

    const imgPlaceholder = document.getElementById(`img-placeholder-${road}`);
    if (imgPlaceholder) imgPlaceholder.style.display = 'flex';

    const vidPlaceholder = document.getElementById(`vid-placeholder-${road}`);
    if (vidPlaceholder) vidPlaceholder.style.display = 'flex';

    const dashFeed = document.getElementById(`feed-container-${road}`);
    if (dashFeed) dashFeed.classList.remove('has-video');

    const imgFeed = document.getElementById(`img-feed-container-${road}`);
    if (imgFeed) imgFeed.classList.remove('has-video');

    const vidFeed = document.getElementById(`vid-feed-container-${road}`);
    if (vidFeed) vidFeed.classList.remove('has-video');

    // 7. Reset video analytics panel
    const reportPanel = document.getElementById(`vid-analytics-report-${road}`);
    const statusVal = document.getElementById(`vid-status-${road}`);
    const grid = document.getElementById(`vid-analytics-grid-${road}`);
    if (reportPanel) reportPanel.style.display = 'none';
    if (statusVal) {
        statusVal.textContent = 'Idle';
        statusVal.className = 'status-val text-idle';
    }
    if (grid) grid.style.display = 'none';

    // 8. Remove any camera selector dropdown overlays
    document.querySelectorAll(`.live-camera-selector-overlay`).forEach(el => {
        if (el.parentNode && (el.parentNode.id === `feed-container-${road}` || el.parentNode.id === `vid-feed-container-${road}`)) {
            el.remove();
        }
    });
}

// Clear feed completely and restore placeholder
function removeVideoFeed(road) {
    cleanupRoadMedia(road);

    // Reset vehicle counts back to defaults
    const defaultCounts = { north: 0, south: 0, east: 0, west: 0 };
    updateRoadVehicleCount(road, defaultCounts[road], 0, 0, 'none');
}

// Upload selected video file to the backend for frame-by-frame processing and tracking
function uploadVideoFile(road, file) {
    const reportPanel = document.getElementById(`vid-analytics-report-${road}`);
    const statusVal = document.getElementById(`vid-status-${road}`);
    const grid = document.getElementById(`vid-analytics-grid-${road}`);
    
    if (!reportPanel || !statusVal || !grid) return;
    
    // Display report panel and transition to processing status
    reportPanel.style.display = 'block';
    statusVal.textContent = 'Processing Video...';
    statusVal.className = 'status-val text-processing';
    grid.style.display = 'none';
    
    if (!backendOnline) {
        statusVal.textContent = 'Simulation Mode';
        statusVal.className = 'status-val text-failed';
        return;
    }
    
    const formData = new FormData();
    formData.append('video', file);
    formData.append('road', road);
    formData.append('model_type', activeModelType);
    
    fetch(`${BACKEND_URL}/detect/video`, {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server error: HTTP ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.status === 'completed') {
            statusVal.textContent = 'Completed';
            statusVal.className = 'status-val text-completed';
            
            // Display stats grid
            grid.style.display = 'grid';
            
            // Populate metrics
            document.getElementById(`vid-stat-total-${road}`).textContent = data.total_vehicles;
            document.getElementById(`vid-stat-density-${road}`).textContent = data.density_percentage + '%';
            document.getElementById(`vid-stat-conf-${road}`).textContent = Math.round(data.average_confidence * 100) + '%';
            
            // Render class counts breakdown
            const tagsContainer = document.getElementById(`vid-class-tags-${road}`);
            tagsContainer.innerHTML = '';
            
            if (data.vehicle_classes && Object.keys(data.vehicle_classes).length > 0) {
                for (const [cls, count] of Object.entries(data.vehicle_classes)) {
                    const tag = document.createElement('span');
                    tag.className = 'class-tag';
                    tag.textContent = `${cls}: ${count}`;
                    tagsContainer.appendChild(tag);
                }
            } else {
                tagsContainer.textContent = 'None detected';
            }
            
            // Calculate heavy count
            let heavyCount = 0;
            const heavyClasses = ['truck', 'bus', 'heavy vehicle', 'container', 'lorry'];
            if (data.vehicle_classes) {
                for (const [cls, cnt] of Object.entries(data.vehicle_classes)) {
                    if (heavyClasses.includes(cls.toLowerCase())) {
                        heavyCount += cnt;
                    }
                }
            }
            
            // Extract fast moving count from backend response
            const fastCount = data.fast_moving_count || 0;

            // Populate Fast-Moving stat in deep video analytics grid
            const vidStatFast = document.getElementById(`vid-stat-fast-${road}`);
            if (vidStatFast) vidStatFast.textContent = fastCount;

            // Sync new vehicle count to dashboard and trigger adaptive signal adjustment
            updateRoadVehicleCount(road, data.total_vehicles, heavyCount, fastCount, 'video');


        } else {
            statusVal.textContent = 'Failed';
            statusVal.className = 'status-val text-failed';
        }
    })
    .catch(err => {
        console.error(`[!] Video deep analytics upload error for ${road}:`, err);
        statusVal.textContent = 'Error';
        statusVal.className = 'status-val text-failed';
    });
}

// Define the missing init function to setup the dashboard clock, signal controller, and initial UI state
function init() {
    // 1. Initialize clock and schedule periodic clock updates
    updateSystemClock();
    setInterval(updateSystemClock, 1000);
    
    // Setup interval for charts
    // setInterval(updateAnalyticsCharts, 3000); // TODO: implement this

    // Load theme on startup
    const savedTheme = localStorage.getItem('traffic_theme') || 'dark';
    setTheme(savedTheme);
    
    // 1.5. Update initial dashboard counts to reflect the state variables
    updateDashboardData();
    
    // 2. Compute initial vehicle counts signal overrides and draw indicators
    recalculateSignals();
    updateSignalUI();
    
    // 3. Start the adaptive traffic controller loop
    startSignalController();
}

// Initialize when DOM loads
window.addEventListener('DOMContentLoaded', () => {
    init();
    
    // Scan backend server connection status on load and periodically
    checkBackendStatus();
    setInterval(checkBackendStatus, 5000);
});

// ==========================================================================
// Performance & Analytics Dashboard Integration (Database Sync & Charting)
// ==========================================================================

function fetchAnalyticsDashboard() {
    console.log("[*] Fetching dynamic historical analytics from SQLite database...");

    const containerWeekly = document.getElementById('weekly-trends-chart');
    const containerHourly = document.getElementById('hourly-peaks-chart');

    if (!backendOnline) {
        console.warn("[!] Backend offline. Loading premium mock database telemetry simulator...");
        renderAnalyticsData(getMockAnalyticsData());
        return;
    }

    fetch(`${BACKEND_URL}/analytics/dashboard`)
        .then(response => {
            if (!response.ok) throw new Error("Analytics HTTP error");
            return response.json();
        })
        .then(data => {
            if (data.status === "success") {
                renderAnalyticsData(data);
            } else {
                throw new Error("Analytics response status failed");
            }
        })
        .catch(err => {
            console.error("[!] Error loading analytics dashboard, falling back to simulator: ", err);
            renderAnalyticsData(getMockAnalyticsData());
        });
}

function renderAnalyticsData(data) {
    // 1. Update Core Telemetry Cards
    const totalEventsEl = document.getElementById('db-stat-total-events');
    const avgDensityEl = document.getElementById('db-stat-avg-density');

    if (totalEventsEl) totalEventsEl.textContent = data.total_events || 0;
    if (avgDensityEl) avgDensityEl.textContent = (data.avg_density || 0).toFixed(1) + '%';

    // 2. Render Vertical Weekly Congestion Trend Chart
    const weeklyContainer = document.getElementById('weekly-trends-chart');
    if (weeklyContainer) {
        weeklyContainer.innerHTML = '';
        
        const weeklyTrends = data.weekly_trends || [];
        const maxVal = Math.max(...weeklyTrends.map(t => t.avg_vehicles), 1); // prevent division by zero

        weeklyTrends.forEach(trend => {
            const heightPercent = Math.max(5, Math.min(100, (trend.avg_vehicles / maxVal) * 100));
            
            const column = document.createElement('div');
            column.className = 'chart-vertical-col';
            column.innerHTML = `
                <span class="chart-bar-tooltip">Avg: ${trend.avg_vehicles.toFixed(1)} vehicles/hr</span>
                <div class="chart-bar-container">
                    <div class="chart-bar" style="height: ${heightPercent}%;"></div>
                </div>
                <span class="chart-bar-label">${trend.day.slice(0, 3)}</span>
            `;
            weeklyContainer.appendChild(column);
        });
    }

    // 3. Render Horizontal Hourly Peaks Trend Chart
    const hourlyContainer = document.getElementById('hourly-peaks-chart');
    if (hourlyContainer) {
        hourlyContainer.innerHTML = '';
        
        const peakHours = data.peak_hours || [];
        const maxVal = Math.max(...peakHours.map(p => p.avg_vehicles), 1);

        // Display 24 hours, but group into intervals or sample every 2nd hour to keep the layout extremely clean on standard screens
        peakHours.forEach(p => {
            const widthPercent = Math.max(5, Math.min(100, (p.avg_vehicles / maxVal) * 100));
            const formattedHour = String(p.hour).padStart(2, '0') + ':00';
            
            // Highlight commute peaks (8:00 - 10:00 & 17:00 - 19:00)
            const isPeak = (8 <= p.hour && p.hour <= 10) || (17 <= p.hour && p.hour <= 19);

            const row = document.createElement('div');
            row.className = 'chart-horizontal-row';
            row.innerHTML = `
                <span class="chart-row-label">${formattedHour}</span>
                <div class="chart-row-bar-track">
                    <div class="chart-row-bar ${isPeak ? 'peak-hour-bar' : ''}" style="width: ${widthPercent}%;"></div>
                </div>
                <span class="chart-row-tooltip">Avg: ${p.avg_vehicles.toFixed(1)} vehicles</span>
            `;
            hourlyContainer.appendChild(row);
        });
    }

    // 4. Render Directional Congestion Comparison Heatmaps
    const roadStats = data.road_stats || [];
    let highestVol = -1;
    let highestRoad = '';
    
    // Find highest load direction
    roadStats.forEach(stat => {
        if (stat.avg_vehicles > highestVol) {
            highestVol = stat.avg_vehicles;
            highestRoad = stat.road;
        }
    });

    roadStats.forEach(stat => {
        const road = stat.road.toLowerCase();
        
        // Remove existing load class
        const card = document.getElementById(`road-comp-${road}`);
        if (card) {
            card.classList.remove('highest-load-glow');
            if (road === highestRoad && highestVol > 0) {
                card.classList.add('highest-load-glow');
            }
        }

        // Update elements
        const avgVolEl = document.getElementById(`road-avg-vol-${road}`);
        const avgHeavyEl = document.getElementById(`road-avg-heavy-${road}`);
        const avgSpeedEl = document.getElementById(`road-avg-speed-${road}`);
        const dotEl = document.querySelector(`#road-comp-${road} .road-comp-dot`);

        if (avgVolEl) avgVolEl.textContent = stat.avg_vehicles.toFixed(1);
        
        // Cargo % calculations
        if (avgHeavyEl) {
            const heavyPercent = stat.avg_vehicles > 0 ? ((stat.avg_heavy / stat.avg_vehicles) * 100) : 0;
            avgHeavyEl.textContent = heavyPercent.toFixed(1) + '%';
        }
        
        if (avgSpeedEl) {
            // Speed displacement is calculated relative to vehicle types and spacing averages
            avgSpeedEl.textContent = stat.avg_fast.toFixed(1) + ' cars/hr';
        }

        // Update dot glows dynamically
        if (dotEl) {
            dotEl.className = 'road-comp-dot';
            if (stat.avg_vehicles >= 12) {
                dotEl.classList.add('dot-high');
            } else if (stat.avg_vehicles >= 6) {
                dotEl.classList.add('dot-medium');
            }
        }
    });

    // 5. Render SQL History Transactions Table
    const tableBody = document.getElementById('logs-table-body');
    if (tableBody) {
        tableBody.innerHTML = '';
        
        const recentLogs = data.recent_logs || [];
        if (recentLogs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="table-empty-row">NO TRANSACTIONS RECORDED IN SQLITE YET.</td></tr>';
            return;
        }

        recentLogs.forEach(log => {
            // Classify density classes for status pills
            let pillClass = 'status-pill-low';
            let densityText = 'LOW';
            if (log.density_percentage >= 100) {
                pillClass = 'status-pill-high';
                densityText = 'CONGESTED';
            } else if (log.density_percentage >= 70) {
                pillClass = 'status-pill-high';
                densityText = 'HIGH';
            } else if (log.density_percentage >= 40) {
                pillClass = 'status-pill-med';
                densityText = 'MEDIUM';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 700; font-family: monospace;">#${log.id}</td>
                <td style="color: var(--text-secondary);">${log.timestamp}</td>
                <td style="text-transform: uppercase; font-weight: 700; color: var(--accent-cyan); letter-spacing: 0.05em;">${log.road} ROAD</td>
                <td style="font-weight: bold; color: #ffffff;">
                    ${log.vehicle_count} 
                    <span style="font-size: 0.68rem; color: var(--text-secondary); font-weight: normal; margin-left: 4px;">
                        (🚛 ${log.heavy_count}) (⚡ ${log.fast_count})
                    </span>
                </td>
                <td>
                    <span class="status-pill ${pillClass}">${log.density_percentage}% ${densityText}</span>
                </td>

                <td style="text-transform: capitalize; color: var(--text-secondary);">
                    ${log.media_type === 'image' ? '📷 Uploaded Photo' : '📹 Video Portal frame'}
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }
}

// Generate premium pre-seeded realistic SQL database simulation data for offline mode
function getMockAnalyticsData() {
    const now = new Date();
    
    // Generate recent logs matching actual dashboard states
    const mockLogs = [];
    const roads = ['north', 'south', 'east', 'west'];
    const media = ['image', 'video'];
    
    for (let i = 0; i < 15; i++) {
        const timestamp = new Date(now.getTime() - i * 8 * 60000); // every 8 minutes
        const road = roads[i % roads.length];
        
        let count;
        if (road === 'east') count = 16 - (i % 3);
        else if (road === 'north') count = 10 - (i % 2);
        else if (road === 'south') count = 5 + (i % 3);
        else count = 2 + (i % 2);

        const heavy = Math.floor(count * 0.15);
        const fast = Math.floor(count * 0.25);
        const density = Math.min(100, Math.round((count / 15.0) * 100));

        mockLogs.push({
            id: 489 - i,
            timestamp: timestamp.toISOString().replace('T', ' ').slice(0, 19),
            road: road,
            vehicle_count: count,
            heavy_count: heavy,
            fast_count: fast,
            density_percentage: density,
            media_type: media[i % media.length]
        });
    }

    return {
        total_events: 489,
        avg_density: 44.5,
        weekly_trends: [
            { day: 'Sunday', avg_vehicles: 5.4 },
            { day: 'Monday', avg_vehicles: 11.2 },
            { day: 'Tuesday', avg_vehicles: 13.8 },
            { day: 'Wednesday', avg_vehicles: 13.2 },
            { day: 'Thursday', avg_vehicles: 14.5 },
            { day: 'Friday', avg_vehicles: 15.8 },
            { day: 'Saturday', avg_vehicles: 6.8 }
        ],
        peak_hours: Array.from({ length: 24 }, (_, h) => {
            const isPeak = (8 <= h && h <= 10) || (17 <= h && h <= 19);
            const baseVal = isPeak ? 17.2 : 4.5;
            const variance = Math.sin(h) * 1.5;
            return { hour: h, avg_vehicles: Math.max(1, baseVal + variance) };
        }),
        road_stats: [
            { road: 'north', avg_vehicles: 9.8, avg_heavy: 1.5, avg_fast: 2.3 },
            { road: 'south', avg_vehicles: 5.6, avg_heavy: 0.7, avg_fast: 1.1 },
            { road: 'east', avg_vehicles: 14.2, avg_heavy: 2.4, avg_fast: 3.2 },
            { road: 'west', avg_vehicles: 7.5, avg_heavy: 1.0, avg_fast: 1.6 }
        ],
        recent_logs: mockLogs
    };
}
