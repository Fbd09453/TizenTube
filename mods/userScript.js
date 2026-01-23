// Visual Console for TV - FIXED VERSION v10
// This creates an on-screen console you can see on your TV
// With WORKING auto-scroll and keyboard controls

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
    let autoScroll = true; // Always auto-scroll by default

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
        overflow-y: auto;
        overflow-x: hidden;
        z-index: 999999;
        border: 3px solid #0f0;
        display: ${enabled ? 'block' : 'none'};
        box-shadow: 0 0 20px rgba(0, 255, 0, 0.5);
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

    // CRITICAL FIX: Simple, reliable scroll function
    function doAutoScroll() {
        if (!consoleDiv || !autoScroll || !enabled) return;
        
        // Use the simplest possible approach - just set scrollTop directly
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
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

    // Keyboard controls - using NUMBER KEYS and media keys that aren't taken
    document.addEventListener('keydown', (e) => {
        // Toggle console visibility with ` or F12
        if (e.key === '`' || e.key === 'F12') {
            enabled = !enabled;
            consoleDiv.style.display = enabled ? 'block' : 'none';
            if (enabled) {
                autoScroll = true;
                doAutoScroll();
            }
        }
        
        // Clear logs with 'c' when console is visible
        if (e.key === 'c' && enabled) {
            logs = [];
            consoleDiv.innerHTML = '';
        }

        // Only handle scroll controls when console is visible
        if (!enabled) return;

        // Number keys for control (available on Samsung remotes)
        // 1 = Scroll Up, 3 = Scroll Down, 5 = Toggle Auto-scroll, 7 = Top, 9 = Bottom
        
        if (e.key === '1') { // Scroll up
            e.preventDefault();
            autoScroll = false;
            consoleDiv.scrollTop -= 100;
            updateBorder();
        }
        else if (e.key === '3') { // Scroll down
            e.preventDefault();
            autoScroll = false;
            consoleDiv.scrollTop += 100;
            updateBorder();
        }
        else if (e.key === '5') { // Toggle auto-scroll
            e.preventDefault();
            autoScroll = !autoScroll;
            updateBorder();
            if (autoScroll) doAutoScroll();
            console.log(`[Console] Auto-scroll: ${autoScroll ? 'ON' : 'OFF'}`);
        }
        else if (e.key === '7') { // Jump to top
            e.preventDefault();
            autoScroll = false;
            consoleDiv.scrollTop = 0;
            updateBorder();
        }
        else if (e.key === '9') { // Jump to bottom + enable auto-scroll
            e.preventDefault();
            autoScroll = true;
            doAutoScroll();
            updateBorder();
        }
        
        // Also support arrow keys as fallback (if they're not intercepted by YouTube)
        else if (e.keyCode === 38 && e.target === document.body) { // Up arrow
            e.preventDefault();
            autoScroll = false;
            consoleDiv.scrollTop -= 50;
            updateBorder();
        }
        else if (e.keyCode === 40 && e.target === document.body) { // Down arrow
            e.preventDefault();
            autoScroll = false;
            consoleDiv.scrollTop += 50;
            updateBorder();
        }
    });

    // Visual indicator of auto-scroll state
    function updateBorder() {
        if (consoleDiv) {
            consoleDiv.style.borderColor = autoScroll ? '#0f0' : '#f80'; // Green = auto, Orange = manual
        }
    }

    window.toggleDebugConsole = function() {
        enabled = !enabled;
        if (consoleDiv) {
            consoleDiv.style.display = enabled ? 'block' : 'none';
            if (enabled) {
                autoScroll = true;
                updateBorder();
                // Wait a tick for display:block to apply
                setTimeout(doAutoScroll, 10);
            }
        }
    };

    window.setDebugConsolePosition = function(pos) {
        currentPosition = pos;
        const posStyles = positions[pos] || positions['bottom-right'];
        if (consoleDiv) Object.assign(consoleDiv.style, posStyles);
    };

    // Watch for config changes
    const checkConfigInterval = setInterval(() => {
        try {
            const config = JSON.parse(window.localStorage[CONFIG_KEY] || '{}');
            const newEnabled = config.enableDebugConsole !== false;
            if (newEnabled !== enabled) {
                enabled = newEnabled;
                if (consoleDiv) {
                    consoleDiv.style.display = enabled ? 'block' : 'none';
                    if (enabled) {
                        autoScroll = true;
                        updateBorder();
                        setTimeout(doAutoScroll, 10);
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
        
        logs.push(logEntry);
        if (logs.length > 150) logs.shift();
        
        if (consoleDiv && enabled) {
            consoleDiv.innerHTML = logs.join('');
            // CRITICAL: Always try to scroll after updating content
            if (autoScroll) {
                // Use setTimeout to ensure DOM has updated
                setTimeout(doAutoScroll, 0);
            }
        }
    }

    // ========== USB Detection for Samsung Tizen - ENHANCED ==========
    let usbCheckCount = 0;
    
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
        
        // Try Tizen filesystem API if available
        if (window.tizen && window.tizen.filesystem) {
            try {
                console.log('[USB] ✓ Tizen filesystem API available');
                
                // List all storages
                const storages = window.tizen.filesystem.listStorages();
                console.log(`[USB] Found ${storages.length} storage device(s)`);
                console.log('[USB] ----------------------------------------');
                
                storages.forEach((storage, idx) => {
                    const icon = storage.type === 'EXTERNAL' ? '📁' : '💾';
                    console.log(`[USB] ${icon} Storage ${idx + 1}:`);
                    console.log(`[USB]   Label: ${storage.label}`);
                    console.log(`[USB]   Type: ${storage.type}`);
                    console.log(`[USB]   State: ${storage.state}`);
                    
                    // Try to resolve and list contents
                    try {
                        window.tizen.filesystem.resolve(
                            storage.label,
                            function(dir) {
                                console.log(`[USB]   ✓ Resolved path: ${dir.fullPath}`);
                                
                                // List directory contents
                                dir.listFiles(
                                    function(files) {
                                        console.log(`[USB]   📂 Contents (${files.length} items):`);
                                        
                                        // Separate folders and files
                                        const folders = files.filter(f => f.isDirectory);
                                        const regularFiles = files.filter(f => f.isFile);
                                        
                                        // List folders first
                                        if (folders.length > 0) {
                                            console.log(`[USB]   📁 Folders (${folders.length}):`);
                                            folders.slice(0, 10).forEach(folder => {
                                                console.log(`[USB]     📁 ${folder.name}/`);
                                            });
                                            if (folders.length > 10) {
                                                console.log(`[USB]     ... and ${folders.length - 10} more folders`);
                                            }
                                        }
                                        
                                        // Then list files
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
        
        // Try common USB mount paths
        const commonPaths = ['usb0', 'usb1', 'usb2', 'sdcard', 'external', 'removable'];
        console.log('[USB] Checking common mount paths...');
        
        commonPaths.forEach(path => {
            if (window.tizen && window.tizen.filesystem) {
                try {
                    window.tizen.filesystem.resolve(
                        path,
                        function(dir) {
                            console.log(`[USB] ✓ Found: ${path} -> ${dir.fullPath}`);
                        },
                        function(err) {
                            // Silently skip non-existent paths
                        }
                    );
                } catch (e) {}
            }
        });
        
        // Check localStorage for USB-related entries
        try {
            const keys = Object.keys(window.localStorage);
            const usbKeys = keys.filter(k => 
                k.toLowerCase().includes('usb') || 
                k.toLowerCase().includes('storage') ||
                k.toLowerCase().includes('external')
            );
            if (usbKeys.length > 0) {
                console.log('[USB] localStorage keys found:', usbKeys.join(', '));
            }
        } catch (e) {}
        
        // Try navigator.storage API
        try {
            if (navigator.storage && navigator.storage.estimate) {
                navigator.storage.estimate().then(function(estimate) {
                    const quotaGB = (estimate.quota / (1024*1024*1024)).toFixed(2);
                    const usageMB = (estimate.usage / (1024*1024)).toFixed(2);
                    console.log(`[USB] Browser storage: ${usageMB}MB used of ${quotaGB}GB quota`);
                }).catch(function(err) {
                    console.log('[USB] Storage estimate failed:', err.message);
                });
            }
        } catch (e) {}
        
        console.log(`[USB] ========================================`);
    }
    
    // Manual USB check function
    window.checkUSB = function() {
        console.log('[USB] 🔍 MANUAL CHECK REQUESTED');
        detectUSB();
    };
    
    // Automatic checks on startup
    setTimeout(detectUSB, 1000);   // 1 second
    setTimeout(detectUSB, 5000);   // 5 seconds
    setTimeout(detectUSB, 20000);  // 20 seconds

    console.log('[Console] ========================================');
    console.log('[Console] Visual Console 94 - FIXED');
    console.log('[Console] ========================================');
    console.log('[Console] Controls:');
    console.log('[Console]   [1] key - Scroll UP');
    console.log('[Console]   [3] key - Scroll DOWN');
    console.log('[Console]   [5] key - Toggle AUTO-SCROLL');
    console.log('[Console]   [7] key - Jump to TOP');
    console.log('[Console]   [9] key - Jump to BOTTOM');
    console.log('[Console]   [c] key - Clear console');
    console.log('[Console]   Border: GREEN=auto-scroll, ORANGE=manual');
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