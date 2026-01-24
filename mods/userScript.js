// Visual Console for TV - FIXED VERSION v10
// This creates an on-screen console you can see on your TV
// With WORKING auto-scroll and keyboard controls

// Visual Console for TV - v100 NEWEST FIRST
(function() {
    const CONFIG_KEY = 'ytaf-configuration';
    
    const getConsolePosition = () => {
        try {
            const config = JSON.parse(window.localStorage[CONFIG_KEY] || '{}');
            return config.debugConsolePosition || 'bottom-right';
        } catch (e) {
            return 'bottom-right';
        }
    };

    const getConsoleEnabled = () => {
        try {
            const config = JSON.parse(window.localStorage[CONFIG_KEY] || '{}');
            return config.enableDebugConsole !== false;
        } catch (e) {
            return true;
        }
    };

    let currentPosition = getConsolePosition();
    let enabled = getConsoleEnabled();

    const positions = {
        'top-left': { top: '0', left: '0', right: '', bottom: '', transform: '' },
        'top-right': { top: '0', right: '0', left: '', bottom: '', transform: '' },
        'bottom-left': { bottom: '0', left: '0', right: '', top: '', transform: '' },
        'bottom-right': { bottom: '0', right: '0', left: '', top: '', transform: '' },
        'center': { top: '50%', left: '50%', right: '', bottom: '', transform: 'translate(-50%, -50%)' }
    };

    const consoleDiv = document.createElement('div');
    consoleDiv.id = 'tv-debug-console';
    
    const posStyles = positions[currentPosition] || positions['bottom-right'];
    consoleDiv.style.cssText = `
        position: fixed;
        width: 900px;
        height: 500px;
        background: rgba(0, 0, 0, 0.95);
        color: #0f0;
        font-family: monospace;
        font-size: 13px;
        padding: 10px;
        overflow-y: scroll;
        overflow-x: hidden;
        z-index: 999999;
        border: 3px solid #0f0;
        display: ${enabled ? 'block' : 'none'};
        box-shadow: 0 0 20px rgba(0, 255, 0, 0.5);
        pointer-events: auto;
        -webkit-overflow-scrolling: touch;
    `;
    
    Object.assign(consoleDiv.style, posStyles);

    if (document.body) {
        document.body.appendChild(consoleDiv);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            document.body.appendChild(consoleDiv);
        });
    }

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    let logs = [];
    window.consoleAutoScroll = true;

    // Simple, WORKING scroll functions
    window.scrollConsoleUp = function() {
        if (!consoleDiv) {
            console.log('[Scroll] ERROR: No console div');
            return;
        }
        const before = consoleDiv.scrollTop;
        consoleDiv.scrollTop = Math.max(0, consoleDiv.scrollTop - 100);
        const after = consoleDiv.scrollTop;
        console.log(`[Scroll] UP: ${before} → ${after} (height: ${consoleDiv.scrollHeight})`);
        window.consoleAutoScroll = false;
        updateBorder();
    };

    window.scrollConsoleDown = function() {
        if (!consoleDiv) {
            console.log('[Scroll] ERROR: No console div');
            return;
        }
        const before = consoleDiv.scrollTop;
        const maxScroll = consoleDiv.scrollHeight - consoleDiv.clientHeight;
        consoleDiv.scrollTop = Math.min(maxScroll, consoleDiv.scrollTop + 100);
        const after = consoleDiv.scrollTop;
        console.log(`[Scroll] DOWN: ${before} → ${after} (max: ${maxScroll})`);
        window.consoleAutoScroll = false;
        updateBorder();
    };

    window.scrollConsoleToTop = function() {
        if (!consoleDiv) {
            console.log('[Scroll] ERROR: No console div');
            return;
        }
        const before = consoleDiv.scrollTop;
        consoleDiv.scrollTop = 0;
        console.log(`[Scroll] To TOP: ${before} → 0`);
        window.consoleAutoScroll = true;
        updateBorder();
    };

    window.scrollConsoleToBottom = function() {
        if (!consoleDiv) {
            console.log('[Scroll] ERROR: No console div');
            return;
        }
        const before = consoleDiv.scrollTop;
        const maxScroll = consoleDiv.scrollHeight - consoleDiv.clientHeight;
        consoleDiv.scrollTop = maxScroll;
        console.log(`[Scroll] To BOTTOM: ${before} → ${maxScroll}`);
        updateBorder();
    };

    window.enableConsoleAutoScroll = function() {
        window.consoleAutoScroll = true;
        console.log('[Scroll] Auto-scroll ON - jumped to TOP');
        updateBorder();
        if (consoleDiv) consoleDiv.scrollTop = 0;
    };

    function updateBorder() {
        if (consoleDiv) {
            consoleDiv.style.borderColor = window.consoleAutoScroll ? '#0f0' : '#f80';
        }
    }

    console.log = function(...args) {
        originalLog.apply(console, args);
        addLog(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '), 'log');
    };

    console.error = function(...args) {
        originalError.apply(console, args);
        addLog(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '), 'error');
    };

    console.warn = function(...args) {
        originalWarn.apply(console, args);
        addLog(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '), 'warn');
    };

    window.toggleDebugConsole = function() {
        enabled = !enabled;
        if (consoleDiv) {
            consoleDiv.style.display = enabled ? 'block' : 'none';
            if (enabled) {
                window.consoleAutoScroll = true;
                updateBorder();
                consoleDiv.scrollTop = 0;
            }
        }
    };

    window.setDebugConsolePosition = function(pos) {
        currentPosition = pos;
        const posStyles = positions[pos] || positions['bottom-right'];
        if (consoleDiv) Object.assign(consoleDiv.style, posStyles);
    };

    const checkConfigInterval = setInterval(() => {
        try {
            const config = JSON.parse(window.localStorage[CONFIG_KEY] || '{}');
            const newEnabled = config.enableDebugConsole !== false;
            if (newEnabled !== enabled) {
                enabled = newEnabled;
                if (consoleDiv) {
                    consoleDiv.style.display = enabled ? 'block' : 'none';
                    if (enabled) {
                        window.consoleAutoScroll = true;
                        updateBorder();
                        consoleDiv.scrollTop = 0;
                    }
                }
            }
            const newPosition = config.debugConsolePosition || 'bottom-right';
            if (newPosition !== currentPosition) {
                currentPosition = newPosition;
                const posStyles = positions[newPosition] || positions['bottom-right'];
                if (consoleDiv) Object.assign(consoleDiv.style, posStyles);
            }
        } catch (e) {}
    }, 500);

    function addLog(message, type = 'log') {
        const color = type === 'error' ? '#f00' : type === 'warn' ? '#ff0' : '#0f0';
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `<div style="color:${color};margin-bottom:5px;word-wrap:break-word;white-space:pre-wrap;">[${timestamp}] ${message}</div>`;
        
        logs.unshift(logEntry); // Add to BEGINNING (newest first)
        if (logs.length > 150) logs.pop();
        
        if (consoleDiv && enabled) {
            consoleDiv.innerHTML = logs.join('');
            if (window.consoleAutoScroll) {
                consoleDiv.scrollTop = 0; // Keep at top for newest
            }
        }
    }

    // USB Detection code stays the same...
    
    function getUSBMonitoringEnabled() {
        try {
            const config = JSON.parse(window.localStorage[CONFIG_KEY] || '{}');
            return config.enableUSBMonitoring === true;
        } catch (e) {
            return false;
        }
    }
    
    function detectUSB() {
        if (!getUSBMonitoringEnabled()) return;
        
        usbCheckCount++;
        console.log(`[USB] ========================================`);
        console.log(`[USB] Check #${usbCheckCount} - Scanning drives...`);
        console.log(`[USB] ========================================`);
        
        if (window.tizen && window.tizen.filesystem) {
            try {
                console.log('[USB] ✓ Tizen filesystem API available');
                
                const storages = window.tizen.filesystem.listStorages();
                console.log(`[USB] Found ${storages.length} storage device(s)`);
                console.log('[USB] ----------------------------------------');
                
                storages.forEach((storage, idx) => {
                    const icon = storage.type === 'EXTERNAL' ? '📁' : '💾';
                    console.log(`[USB] ${icon} Storage ${idx + 1}:`);
                    console.log(`[USB]   Label: ${storage.label}`);
                    console.log(`[USB]   Type: ${storage.type}`);
                    console.log(`[USB]   State: ${storage.state}`);
                    
                    try {
                        window.tizen.filesystem.resolve(
                            storage.label,
                            function(dir) {
                                console.log(`[USB]   ✓ Resolved path: ${dir.fullPath}`);
                                
                                dir.listFiles(
                                    function(files) {
                                        console.log(`[USB]   📂 Contents (${files.length} items):`);
                                        
                                        const folders = files.filter(f => f.isDirectory);
                                        const regularFiles = files.filter(f => f.isFile);
                                        
                                        if (folders.length > 0) {
                                            console.log(`[USB]   📁 Folders (${folders.length}):`);
                                            folders.slice(0, 10).forEach(folder => {
                                                console.log(`[USB]     📁 ${folder.name}/`);
                                            });
                                            if (folders.length > 10) {
                                                console.log(`[USB]     ... and ${folders.length - 10} more folders`);
                                            }
                                        }
                                        
                                        if (regularFiles.length > 0) {
                                            console.log(`[USB]   📄 Files (${regularFiles.length}):`);
                                            regularFiles.slice(0, 10).forEach(file => {
                                                const sizeKB = (file.fileSize / 1024).toFixed(1);
                                                const sizeMB = file.fileSize > 1024 * 1024 ? 
                                                    ` (${(file.fileSize / (1024 * 1024)).toFixed(1)}MB)` : '';
                                                console.log(`[USB]     📄 ${file.name} - ${sizeKB}KB${sizeMB}`);
                                            });
                                            if (regularFiles.length > 10) {
                                                console.log(`[USB]     ... and ${regularFiles.length - 10} more files`);
                                            }
                                        }
                                        
                                        if (files.length === 0) {
                                            console.log(`[USB]   (empty directory)`);
                                        }
                                    },
                                    function(err) {
                                        console.log(`[USB]   ✗ Error listing files: ${err.message}`);
                                    }
                                );
                            },
                            function(err) {
                                console.log(`[USB]   ✗ Error resolving: ${err.message}`);
                            }
                        );
                    } catch (e) {
                        console.log(`[USB]   ✗ Exception: ${e.message}`);
                    }
                    console.log('[USB] ----------------------------------------');
                });
            } catch (e) {
                console.log('[USB] ✗ Tizen filesystem error:', e.message);
            }
        } else {
            console.log('[USB] ✗ Tizen filesystem API not available');
        }
        
        console.log(`[USB] ========================================`);
    }
    
    let usbCheckCount = 0;
    window.checkUSB = function() {
        console.log('[USB] 🔍 MANUAL CHECK REQUESTED');
        detectUSB();
    };
    
    setTimeout(detectUSB, 1000);
    setTimeout(detectUSB, 5000);
    setTimeout(detectUSB, 20000);

    console.log('[Console] ========================================');
    console.log('[Console] Visual Console v105 - NEWEST FIRST');
    console.log('[Console] ========================================');
    console.log('[Console] ⚡ NEWEST LOGS AT TOP (scroll down for older)');
    console.log('[Console] Remote Controls:');
    console.log('[Console]   RED button - Scroll UP (older logs)');
    console.log('[Console]   GREEN button - Scroll DOWN (newer logs)');
    console.log('[Console]   YELLOW button - Jump to TOP (newest)');
    console.log('[Console]   BLUE button - Jump to BOTTOM (oldest)');
    console.log('[Console]   ');
    console.log('[Console]   Border colors:');
    console.log('[Console]     GREEN = Showing newest logs');
    console.log('[Console]     ORANGE = Manual scroll mode');
    console.log('[Console] Position:', currentPosition);
    console.log('[Console] Enabled:', enabled);
    console.log('[Console] ========================================');
    
    updateBorder();
    if (enabled) detectUSB();
})();

import "./features/userAgentSpoofing.js";
import "whatwg-fetch";
import 'core-js/proposals/object-getownpropertydescriptors';
import '@formatjs/intl-getcanonicallocales/polyfill.iife'
import '@formatjs/intl-locale/polyfill.iife'
import '@formatjs/intl-displaynames/polyfill.iife'
import '@formatjs/intl-displaynames/locale-data/en';

import "./domrect-polyfill";
import "./features/adblock.js";
import "./features/sponsorblock.js";
import "./ui/ui.js";
import "./ui/speedUI.js";
import "./ui/theme.js";
import "./ui/settings.js";
import "./ui/disableWhosWatching.js";
import "./features/moreSubtitles.js";
import "./features/updater.js";
import "./features/pictureInPicture.js";
import "./features/preferredVideoQuality.js";
import "./features/videoQueuing.js";
import "./features/enableFeatures.js";
import "./ui/customUI.js";
import "./ui/customGuideAction.js";