// Visual Console for TV
// This creates an on-screen console you can see on your TV

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
    let scrollTimer = null;

    // Simple, aggressive auto-scroll function
    function forceScrollToBottom() {
        if (!consoleDiv) return;
        
        // Cancel any pending scroll
        if (scrollTimer) {
            clearTimeout(scrollTimer);
        }
        
        // Scroll immediately
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
        
        // And again after a tiny delay (catches late renders)
        scrollTimer = setTimeout(() => {
            consoleDiv.scrollTop = consoleDiv.scrollHeight;
        }, 50);
        
        // And one more time for good measure
        setTimeout(() => {
            consoleDiv.scrollTop = consoleDiv.scrollHeight;
        }, 150);
    }

    function addLog(message, type = 'log') {
        const color = type === 'error' ? '#f00' : type === 'warn' ? '#ff0' : '#0f0';
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `<div style="color:${color};margin-bottom:5px;word-wrap:break-word;white-space:pre-wrap;">[${timestamp}] ${message}</div>`;

        logs.push(logEntry);
        if (logs.length > 100) logs.shift();

        if (consoleDiv) {
            consoleDiv.innerHTML = logs.join('');
            forceScrollToBottom();
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

    // Keyboard toggle
    document.addEventListener('keydown', (e) => {
        if (e.key === '`' || e.key === 'F12') {
            enabled = !enabled;
            consoleDiv.style.display = enabled ? 'block' : 'none';
            saveConfig({ enableDebugConsole: enabled });
        }
        if (e.key === 'c' && enabled) {
            logs = [];
            consoleDiv.innerHTML = '';
        }
    });

    function saveConfig(updates) {
        try {
            const config = JSON.parse(window.localStorage[CONFIG_KEY] || '{}');
            Object.assign(config, updates);
            window.localStorage[CONFIG_KEY] = JSON.stringify(config);
            
            if (window.configChangeEmitter) {
                Object.keys(updates).forEach(key => {
                    window.configChangeEmitter.dispatchEvent(
                        new CustomEvent('configChange', { detail: { key, value: updates[key] } })
                    );
                });
            }
        } catch (e) {
            // ignore
        }
    }

    window.toggleDebugConsole = function() {
        enabled = !enabled;
        if (consoleDiv) {
            consoleDiv.style.display = enabled ? 'block' : 'none';
        }
        saveConfig({ enableDebugConsole: enabled });
        
        if (enabled) {
            addLog('[Visual Console] Console SHOWN', 'log');
        }
    };

    window.setDebugConsolePosition = function(pos) {
        currentPosition = pos;
        const posStyles = positions[pos] || positions['bottom-right'];
        
        if (consoleDiv) {
            Object.assign(consoleDiv.style, posStyles);
        }
        
        saveConfig({ debugConsolePosition: pos });
        addLog('[Visual Console] Position: ' + pos, 'log');
    };

    // Monitor config changes
    const checkConfigInterval = setInterval(() => {
        try {
            const config = JSON.parse(window.localStorage[CONFIG_KEY] || '{}');
            
            const newEnabled = config.enableDebugConsole !== false;
            if (newEnabled !== enabled) {
                enabled = newEnabled;
                if (consoleDiv) {
                    consoleDiv.style.display = enabled ? 'block' : 'none';
                }
            }
            
            const newPosition = config.debugConsolePosition || 'bottom-right';
            if (newPosition !== currentPosition) {
                currentPosition = newPosition;
                const posStyles = positions[newPosition] || positions['bottom-right'];
                if (consoleDiv) {
                    Object.assign(consoleDiv.style, posStyles);
                }
            }
        } catch (e) {
            // ignore
        }
    }, 500);

    console.log('[Visual Console] Initialized v4 - Reliable auto-scroll');
    console.log('[Visual Console] Position: ' + currentPosition);
    console.log('[Visual Console] Enabled: ' + enabled);
})();

import "./utils/debugBridge.js";
import "./utils/debugServer.js";
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