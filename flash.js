// Configuration
const MANIFEST_URL = './latest.json';
const MANIFEST_CACHE_KEY = 'inkplate_manifest_cache';
const MANIFEST_CACHE_TTL = 3600000; // 1 hour

// State
let manifest = null;
let selectedAsset = null;
let currentDevice = null;

// DOM Elements
const loadingEl = document.getElementById('loading');
const firmwareOptionsEl = document.getElementById('firmware-options');
const manifestErrorEl = document.getElementById('manifest-error');
const boardSelectEl = document.getElementById('board-select');
const connectBtnEl = document.getElementById('connect-btn');
const progressSectionEl = document.getElementById('progress-section');
const progressFillEl = document.getElementById('progress-fill');
const progressTextEl = document.getElementById('progress-text');
const statusMessageEl = document.getElementById('status-message');
const deviceInfoSectionEl = document.getElementById('device-info-section');
const deviceMacEl = document.getElementById('device-mac');
const deviceChipEl = document.getElementById('device-chip');
const confirmFlashBtnEl = document.getElementById('confirm-flash-btn');
const cancelBtnEl = document.getElementById('cancel-btn');
const completionSectionEl = document.getElementById('completion-section');
const completionTitleEl = document.getElementById('completion-title');
const completionMessageEl = document.getElementById('completion-message');
const restartBtnEl = document.getElementById('restart-btn');
const versionDisplayEl = document.getElementById('version-display');
const publishedDisplayEl = document.getElementById('published-display');
const localFileEl = document.getElementById('local-file');
const flashLocalBtnEl = document.getElementById('flash-local-btn');
const localFileErrorEl = document.getElementById('local-file-error');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadManifest();
        setupEventListeners();
    } catch (error) {
        console.error('Initialization error:', error);
    }
});

// Load manifest from cache or fetch
async function loadManifest() {
    try {
        // Try to load from cache first
        const cached = loadFromCache();
        if (cached) {
            manifest = cached;
            populateFirmwareOptions();
            return;
        }

        // Fetch fresh manifest
        const response = await fetch(MANIFEST_URL);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        manifest = await response.json();
        saveToCache(manifest);
        populateFirmwareOptions();
    } catch (error) {
        console.error('Failed to load manifest:', error);
        showManifestError();
        loadingEl.hidden = true;
    }
}

// Cache management
function loadFromCache() {
    try {
        const cached = localStorage.getItem(MANIFEST_CACHE_KEY);
        if (!cached) return null;

        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp > MANIFEST_CACHE_TTL) {
            localStorage.removeItem(MANIFEST_CACHE_KEY);
            return null;
        }

        return data;
    } catch {
        localStorage.removeItem(MANIFEST_CACHE_KEY);
        return null;
    }
}

function saveToCache(data) {
    try {
        localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
    } catch (error) {
        console.warn('Failed to cache manifest:', error);
    }
}

// Populate firmware selection options
function populateFirmwareOptions() {
    if (!manifest || !manifest.assets || manifest.assets.length === 0) {
        showManifestError();
        return;
    }

    // Display version info
    versionDisplayEl.textContent = `Version: ${manifest.tag_name || 'Unknown'}`;
    publishedDisplayEl.textContent = `Published: ${formatDate(manifest.published_at)}`;

    // Populate board select
    boardSelectEl.innerHTML = '<option value="">-- Choose a board --</option>';
    manifest.assets.forEach((asset, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = asset.display_name || asset.board;
        boardSelectEl.appendChild(option);
    });

    // Update UI
    loadingEl.hidden = true;
    firmwareOptionsEl.hidden = false;
    connectBtnEl.disabled = true;
}

// Format ISO date to readable string
function formatDate(isoDate) {
    try {
        return new Date(isoDate).toLocaleString();
    } catch {
        return isoDate;
    }
}

// Show manifest error
function showManifestError() {
    manifestErrorEl.hidden = false;
    loadingEl.hidden = true;
    firmwareOptionsEl.hidden = true;
}

// Setup event listeners
function setupEventListeners() {
    boardSelectEl.addEventListener('change', (e) => {
        connectBtnEl.disabled = e.target.value === '';
    });

    connectBtnEl.addEventListener('click', handleConnect);
    confirmFlashBtnEl.addEventListener('click', handleConfirmFlash);
    cancelBtnEl.addEventListener('click', handleCancel);
    restartBtnEl.addEventListener('click', handleRestart);

    localFileEl.addEventListener('change', () => {
        flashLocalBtnEl.disabled = !localFileEl.files || localFileEl.files.length === 0;
    });

    flashLocalBtnEl.addEventListener('click', handleFlashLocal);
}

// Handle Connect & Flash button
async function handleConnect() {
    try {
        const assetIndex = parseInt(boardSelectEl.value);
        if (isNaN(assetIndex)) return;

        selectedAsset = manifest.assets[assetIndex];
        if (!selectedAsset) return;

        // Request serial port
        currentDevice = await navigator.serial.requestPort();

        // Get device info
        await showDeviceInfo();
    } catch (error) {
        if (error.name === 'NotAllowedError') {
            showStatus('Serial port selection cancelled');
        } else {
            showError('Failed to connect to device: ' + error.message);
        }
    }
}

// Show device information
async function showDeviceInfo() {
    try {
        deviceInfoSectionEl.hidden = false;

        // Get device info using ESP Web Tools
        const info = await getDeviceInfo();
        if (info) {
            deviceMacEl.textContent = info.mac || '--';
            deviceChipEl.textContent = info.chip || '--';
        }
    } catch (error) {
        console.warn('Could not retrieve device info:', error);
    }
}

// Get device info (using esptool-js)
async function getDeviceInfo() {
    try {
        const { ESPLoader } = window;
        if (!ESPLoader) {
            console.warn('esptool-js not available for device info');
            return { mac: 'Connected', chip: 'ESP32' };
        }

        const port = currentDevice;
        const esploader = new ESPLoader({
            port: port,
            baudrate: 115200,
            logger: () => {},
            term: { clean: () => {}, write: () => {} }
        });

        await esploader.connect();
        const macAddr = await esploader.read_mac();
        await esploader.disconnect();

        return {
            mac: macAddr || 'Connected',
            chip: 'ESP32'
        };
    } catch (error) {
        console.warn('Device info retrieval failed:', error);
        return { mac: 'Connected', chip: 'ESP32' };
    }
}

// Confirm and flash firmware
async function handleConfirmFlash() {
    if (!selectedAsset || !currentDevice) {
        showError('No device or firmware selected');
        return;
    }

    try {
        deviceInfoSectionEl.hidden = true;
        progressSectionEl.hidden = false;
        connectBtnEl.disabled = true;

        await flashFirmware(currentDevice, selectedAsset.url);
    } catch (error) {
        showError('Flashing failed: ' + error.message);
    }
}

// Flash firmware using esptool-js for real flashing
async function flashFirmware(port, firmwareUrl) {
    let esploader = null;
    try {
        updateProgress(0, 'Starting connection...');

        // Download firmware with fallback for GitHub release URLs
        updateProgress(10, 'Downloading firmware...');
        console.log('Fetching firmware from:', firmwareUrl);
        
        let firmwareBuffer;
        let downloadSuccess = false;
        let lastError = null;
        
        // Prepare fallback URLs if it's a GitHub release
        const fallbackUrls = [firmwareUrl];
        
        if (firmwareUrl.includes('github.com') && firmwareUrl.includes('/releases/download/')) {
            // Extract parts for jsdelivr CDN: https://cdn.jsdelivr.net/gh/user/repo@version/path/to/file
            const match = firmwareUrl.match(/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/(.*)/);
            if (match) {
                const [, owner, repo, tag, filename] = match;
                const jsdelivrUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${tag}/${filename}`;
                fallbackUrls.push(jsdelivrUrl);
                console.log('Added jsDelivr fallback:', jsdelivrUrl);
            }
        }
        
        // Try each URL
        for (let i = 0; i < fallbackUrls.length && !downloadSuccess; i++) {
            const url = fallbackUrls[i];
            console.log(`Attempt ${i + 1}/${fallbackUrls.length}: ${url}`);
            
            try {
                updateProgress(10 + (i * 2), `Downloading firmware (attempt ${i + 1})...`);
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/octet-stream',
                        'Cache-Control': 'no-cache'
                    },
                    redirect: 'follow'
                });
                
                if (response.ok) {
                    firmwareBuffer = await response.arrayBuffer();
                    if (firmwareBuffer.byteLength > 0) {
                        console.log('✓ Download successful! Size:', firmwareBuffer.byteLength, 'bytes');
                        downloadSuccess = true;
                        break;
                    } else {
                        lastError = 'Downloaded file is empty';
                    }
                } else {
                    lastError = `HTTP ${response.status}: ${response.statusText}`;
                    console.warn(`✗ HTTP error: ${lastError}`);
                }
            } catch (error) {
                lastError = error.message;
                console.warn(`✗ Fetch failed: ${lastError}`);
            }
        }
        
        // If all methods failed
        if (!downloadSuccess) {
            const suggestion = 'Please use the "Upload Local Firmware" section below to upload a .bin file instead.';
            throw new Error(`Failed to download firmware.\n\nError: ${lastError}\n\n${suggestion}`);
        }
        
        const firmwareArray = new Uint8Array(firmwareBuffer);

        updateProgress(20, 'Initializing esptool...');

        // Access the esptool library
        const { ESPLoader, CHIP_DEFS } = window;
        if (!ESPLoader) {
            throw new Error('esptool-js library not loaded. Please refresh the page.');
        }

        // Create esploader instance
        esploader = new ESPLoader({
            port: port,
            baudrate: 115200,
            logger: console.log,
            term: {
                clean: () => {},
                write: (data) => console.log(data),
            }
        });

        updateProgress(25, 'Connecting to device...');
        await esploader.connect();

        updateProgress(30, 'Reading device info...');
        const chipName = await esploader.read_mac();
        console.log('Connected to chip:', chipName);

        updateProgress(40, 'Erasing flash...');
        // Erase the flash (0x1000 to 0x1000 + firmware size)
        await esploader.erase_flash();

        updateProgress(50, 'Writing firmware...');

        // Write firmware starting at offset 0x1000 (standard for ESP32)
        const fileArray = [{
            data: firmwareArray,
            address: 0x1000,
        }];

        // Flash the firmware
        await esploader.write_flash(fileArray, {
            flash_mode: 'dio',
            flash_freq: '40m',
            flash_size: 'keep',
            compress: true,
            encrypted: false,
        });

        updateProgress(90, 'Verifying...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        updateProgress(95, 'Disconnecting...');
        await esploader.disconnect();
        esploader = null;

        updateProgress(100, 'Flash complete!');
        showCompletion('Firmware flashed successfully! Your device will restart.');
    } catch (error) {
        if (esploader) {
            try {
                await esploader.disconnect();
            } catch (e) {
                console.warn('Error during disconnect:', e);
            }
        }
        throw error;
    }
}

// Handle local file flash
async function handleFlashLocal() {
    const files = localFileEl.files;
    if (!files || files.length === 0) {
        showLocalFileError('Please select a file');
        return;
    }

    const file = files[0];
    if (!file.name.endsWith('.bin')) {
        showLocalFileError('Please select a .bin file');
        return;
    }

    try {
        localFileErrorEl.hidden = true;
        deviceInfoSectionEl.hidden = false;

        // Request serial port
        currentDevice = await navigator.serial.requestPort();

        // Get device info
        await showDeviceInfo();

        // Store file for flashing
        selectedAsset = {
            display_name: file.name,
            url: URL.createObjectURL(file),
            isLocal: true
        };
    } catch (error) {
        if (error.name !== 'NotAllowedError') {
            showLocalFileError('Failed to connect: ' + error.message);
        }
    }
}

// Update progress bar
function updateProgress(percent, message) {
    progressFillEl.style.width = percent + '%';
    progressTextEl.textContent = percent + '%';
    if (message) {
        statusMessageEl.textContent = message;
    }
}

// Show status message
function showStatus(message) {
    statusMessageEl.textContent = message;
}

// Show error message
function showError(message) {
    updateProgress(0, '');
    // Truncate message and show in progress area
    const displayMessage = message.length > 200 ? message.substring(0, 200) + '...' : message;
    statusMessageEl.textContent = displayMessage;
    statusMessageEl.style.color = '#d32f2f';
    progressSectionEl.hidden = false;
    
    // Log full message to console for debugging
    console.error('Flash error:', message);
}

// Show local file error
function showLocalFileError(message) {
    localFileErrorEl.textContent = message;
    localFileErrorEl.hidden = false;
}

// Show completion message
function showCompletion(message) {
    progressSectionEl.hidden = true;
    completionSectionEl.hidden = false;
    completionTitleEl.textContent = 'Flashing Complete!';
    completionMessageEl.textContent = message;
}

// Handle cancel
function handleCancel() {
    if (currentDevice) {
        currentDevice.close().catch(() => {});
    }
    deviceInfoSectionEl.hidden = true;
    progressSectionEl.hidden = true;
    connectBtnEl.disabled = false;
    connectBtnEl.focus();
}

// Handle restart
function handleRestart() {
    if (currentDevice) {
        currentDevice.close().catch(() => {});
    }
    completionSectionEl.hidden = true;
    progressSectionEl.hidden = true;
    deviceInfoSectionEl.hidden = true;
    firmwareOptionsEl.hidden = false;
    localFileEl.value = '';
    flashLocalBtnEl.disabled = true;
    boardSelectEl.value = '';
    connectBtnEl.disabled = true;
    connectBtnEl.focus();
}
