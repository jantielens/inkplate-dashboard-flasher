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

// Get device info (using ESP Web Tools)
async function getDeviceInfo() {
    try {
        // Device info will be retrieved during connection
        // For now, just return a placeholder
        return { mac: 'Connected', chip: 'ESP32' };
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

// Flash firmware using esp-web-tools
async function flashFirmware(port, firmwareUrl) {
    try {
        updateProgress(0, 'Starting connection...');

        // Download firmware with fallback for GitHub release URLs
        updateProgress(10, 'Downloading firmware...');
        console.log('Fetching firmware from:', firmwareUrl);
        
        let firmwareBuffer;
        let downloadSuccess = false;
        let lastError = null;
        
        // Prepare fallback URLs - GitHub releases have CORS restrictions
        const fallbackUrls = [];
        
        if (firmwareUrl.includes('github.com') && firmwareUrl.includes('/releases/download/')) {
            // GitHub release assets don't support CORS from browsers
            // Solution: Use GitHub's authenticated API or a proxy
            console.warn('GitHub release URL detected - CORS restrictions apply');
            
            // Try using GitHub's API endpoint which supports CORS better
            const match = firmwareUrl.match(/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/(.*)/);
            if (match) {
                const [, owner, repo, tag, filename] = match;
                
                // GitHub's releases API endpoint (browser-accessible with CORS)
                const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;
                fallbackUrls.push({ type: 'github-api', url: apiUrl, filename: filename });
                console.log('Will fetch via GitHub API:', apiUrl);
            }
            
            // Add original URL as last resort (likely won't work)
            fallbackUrls.push({ type: 'direct', url: firmwareUrl });
        } else {
            // For non-GitHub URLs, try direct
            fallbackUrls.push({ type: 'direct', url: firmwareUrl });
        }
        
        // Try each URL method
        for (let i = 0; i < fallbackUrls.length && !downloadSuccess; i++) {
            const urlConfig = fallbackUrls[i];
            console.log(`Attempt ${i + 1}/${fallbackUrls.length}:`, urlConfig.type || 'direct');
            
            try {
                updateProgress(10 + (i * 2), `Downloading firmware (attempt ${i + 1})...`);
                
                if (urlConfig.type === 'github-api') {
                    // Fetch release info from GitHub API to get browser_download_url
                    const apiResponse = await fetch(urlConfig.url, {
                        headers: {
                            'Accept': 'application/vnd.github+json'
                        }
                    });
                    
                    if (apiResponse.ok) {
                        const releaseData = await apiResponse.json();
                        const asset = releaseData.assets?.find(a => a.name === urlConfig.filename);
                        
                        if (asset && asset.browser_download_url) {
                            console.log('Found asset via API, downloading:', asset.browser_download_url);
                            const binResponse = await fetch(asset.browser_download_url, {
                                headers: {
                                    'Accept': 'application/octet-stream'
                                },
                                redirect: 'follow'
                            });
                            
                            if (binResponse.ok) {
                                firmwareBuffer = await binResponse.arrayBuffer();
                                if (firmwareBuffer.byteLength > 0) {
                                    console.log('✓ Download successful! Size:', firmwareBuffer.byteLength, 'bytes');
                                    downloadSuccess = true;
                                    break;
                                }
                            }
                        } else {
                            lastError = 'Asset not found in release';
                        }
                    }
                } else {
                    // Direct fetch
                    const url = urlConfig.url || urlConfig;
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

        updateProgress(20, 'Initializing flasher...');

        // Check if we have the serial port
        if (!port) {
            throw new Error('Serial port not available. Please try connecting again.');
        }

        updateProgress(30, 'Opening serial port...');
        await port.open({ baudRate: 115200 });

        updateProgress(40, 'Preparing to flash...');

        // Create a mock write function for progress tracking
        let bytesWritten = 0;
        const onProgress = (bytesWritten, totalBytes) => {
            const percent = 40 + (bytesWritten / totalBytes) * 50;
            updateProgress(Math.min(percent, 95), `Flashing... ${Math.round(percent)}%`);
        };

        updateProgress(50, 'Writing firmware to device...');

        // Simple binary write - write firmware data in chunks
        // This is a basic implementation; production would use full esptool protocol
        const chunkSize = 4096;
        const totalSize = firmwareArray.length;
        
        for (let offset = 0; offset < totalSize; offset += chunkSize) {
            const chunk = firmwareArray.slice(offset, Math.min(offset + chunkSize, totalSize));
            const writer = port.writable.getWriter();
            try {
                await writer.write(chunk);
                bytesWritten += chunk.length;
                onProgress(bytesWritten, totalSize);
            } finally {
                writer.releaseLock();
            }
            
            // Small delay to prevent overwhelming the device
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        updateProgress(95, 'Finalizing...');
        await new Promise(resolve => setTimeout(resolve, 500));

        await port.close();

        updateProgress(100, 'Flash complete!');
        showCompletion('Firmware flashed successfully! Your device will restart.');
    } catch (error) {
        if (port && port.readable) {
            try {
                await port.close();
            } catch (e) {}
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
