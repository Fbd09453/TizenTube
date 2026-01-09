// WebSocket Logger for TizenTube

import { configRead, configChangeEmitter } from '../config.js';

class WebSocketLogger {
  constructor() {
    this.enabled = false;
    this.serverUrl = '';
    this.logLevel = 'INFO';
    this.maxBatchSize = 10;
    this.batchInterval = 5000;
    this.logQueue = [];
    this.batchTimer = null;
    this.lastError = null;
    this.connectionTested = false;
    this.ws = null;
    this.reconnectTimer = null;
    this.reconnectInterval = 5000;

    // Listen for config changes
    try {
      configChangeEmitter.addEventListener('configChange', (ev) => {
        const key = ev.detail && ev.detail.key;
        if (['enableRemoteLogging', 'syslogServerIp', 'syslogServerPort', 'logLevel'].includes(key)) {
          this.reinitialize();
        }
      });
    } catch (e) {
      // ignore if emitter not available
    }

    this.init();
  }

  init() {
    try {
      this.enabled = configRead('enableRemoteLogging') || false;

      const ip = configRead('syslogServerIp') || '192.168.1.100';
      const port = configRead('syslogServerPort') || 8081; // WebSocket port
      this.serverUrl = `ws://${ip}:${port}`;

      this.logLevel = configRead('logLevel') || 'INFO';

      if (this.enabled) {
        console.log(`[Logger] ✓ Remote logging ENABLED (WebSocket)`);
        console.log(`[Logger] → Server: ${this.serverUrl}`);
        console.log(`[Logger] → Log Level: ${this.logLevel}`);
        this.connect();
        this.startBatchTimer();
      } else {
        console.log('[Logger] ✗ Remote logging DISABLED');
        this.disconnect();
        if (this.batchTimer) {
          clearInterval(this.batchTimer);
          this.batchTimer = null;
        }
      }
    } catch (error) {
      console.error('[Logger] Initialization error:', error);
      this.enabled = false;
    }
  }

  reinitialize() {
    console.log('[Logger] Re-initializing with new settings...');
    this.disconnect();
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.logQueue = [];
    this.init();
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      console.log(`[Logger] Connecting to ${this.serverUrl}...`);
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        console.log('[Logger] ✓ WebSocket connected');
        this.lastError = null;
        this.connectionTested = true;
        
        // Flush any queued logs
        if (this.logQueue.length > 0) {
          this.flush();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          console.log('[Logger] Server response:', response);
        } catch (e) {
          console.log('[Logger] Server message:', event.data);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Logger] WebSocket error:', error);
        this.lastError = 'WebSocket connection error';
      };

      this.ws.onclose = () => {
        console.log('[Logger] WebSocket disconnected');
        this.ws = null;
        
        // Auto-reconnect if logging is enabled
        if (this.enabled && !this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, this.reconnectInterval);
        }
      };
    } catch (error) {
      console.error('[Logger] Failed to create WebSocket:', error);
      this.lastError = error.message;
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  startBatchTimer() {
    if (this.batchTimer) clearInterval(this.batchTimer);

    this.batchTimer = setInterval(() => {
      this.flush();
    }, this.batchInterval);
  }

  shouldLog(level) {
    const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  formatMessage(level, category, message, data) {
    const timestamp = new Date().toISOString();
    const device = window.h5vcc?.tizentube?.GetVersion() || 'TizenTube';

    return {
      timestamp,
      device,
      level,
      category,
      message,
      data: data || {},
      url: window.location.href
    };
  }

  sendBatch(logs) {
    if (!this.enabled || !this.serverUrl) {
      console.log('[Logger] Cannot send: logging disabled or no server URL');
      return false;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[Logger] WebSocket not connected, queuing logs...');
      return false;
    }

    console.log(`[Logger] → Sending ${logs.length} logs via WebSocket...`);

    try {
      const payload = {
        logs,
        source: 'TizenTube',
        version: window.h5vcc?.tizentube?.GetVersion() || 'unknown'
      };

      this.ws.send(JSON.stringify(payload));
      console.log(`[Logger] ✓ Sent ${logs.length} logs`);
      this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = error.message;
      console.error('[Logger] ✗ Error sending logs:', error);
      return false;
    }
  }

  log(level, category, message, data) {
    const consoleMethod = level === 'ERROR' ? 'error' :
                         level === 'WARN' ? 'warn' :
                         level === 'DEBUG' ? 'debug' : 'log';

    console[consoleMethod](`[${category}]`, message, data || '');

    if (this.enabled && this.shouldLog(level)) {
      const logEntry = this.formatMessage(level, category, message, data);
      this.logQueue.push(logEntry);

      if (this.logQueue.length >= this.maxBatchSize || level === 'ERROR') {
        this.flush();
      }
    }
  }

  flush() {
    if (this.logQueue.length === 0) return;

    const logsToSend = [...this.logQueue];
    this.logQueue = [];

    this.sendBatch(logsToSend);
  }

  debug(category, message, data) {
    this.log('DEBUG', category, message, data);
  }

  info(category, message, data) {
    this.log('INFO', category, message, data);
  }

  warn(category, message, data) {
    this.log('WARN', category, message, data);
  }

  error(category, message, data) {
    this.log('ERROR', category, message, data);
  }

  async testConnection() {
    console.log('[Logger] ═══════════════════════════════════════');
    console.log('[Logger] Testing WebSocket connection...');
    console.log('[Logger] ═══════════════════════════════════════');

    const ip = configRead('syslogServerIp') || '192.168.1.100';
    const port = configRead('syslogServerPort') || 8081;
    const url = `ws://${ip}:${port}`;

    console.log(`[Logger] → Attempting connection to: ${url}`);

    return new Promise((resolve) => {
      try {
        const testWs = new WebSocket(url);
        
        const timeout = setTimeout(() => {
          testWs.close();
          resolve({
            success: false,
            error: 'Connection timeout (5s)'
          });
        }, 5000);

        testWs.onopen = () => {
          clearTimeout(timeout);
          
          const testLog = this.formatMessage(
            'INFO',
            'CONNECTION_TEST',
            '🧪 WebSocket connection test from TizenTube',
            {
              testId: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toISOString(),
              serverIp: ip,
              serverPort: port
            }
          );

          const payload = {
            logs: [testLog],
            source: 'TizenTube-Test',
            version: window.h5vcc?.tizentube?.GetVersion() || 'unknown'
          };

          testWs.send(JSON.stringify(payload));
          
          setTimeout(() => {
            testWs.close();
            console.log('[Logger] ✓ CONNECTION TEST SUCCESSFUL!');
            resolve({
              success: true,
              message: 'Connection successful! Check your PC terminal.'
            });
          }, 500);
        };

        testWs.onerror = (error) => {
          clearTimeout(timeout);
          console.error('[Logger] ✗ Connection error:', error);
          resolve({
            success: false,
            error: 'WebSocket connection failed'
          });
        };
      } catch (error) {
        console.error('[Logger] ✗ Test failed:', error);
        resolve({
          success: false,
          error: error.message
        });
      }
    });
  }

  getStatus() {
    return {
      enabled: this.enabled,
      serverUrl: this.serverUrl,
      logLevel: this.logLevel,
      queueSize: this.logQueue.length,
      lastError: this.lastError,
      connectionTested: this.connectionTested,
      connected: this.ws && this.ws.readyState === WebSocket.OPEN
    };
  }
}

const logger = new WebSocketLogger();
export default logger;

if (typeof window !== 'undefined') {
  window.TizenLogger = logger;
  console.log('[Logger] ═══════════════════════════════════════');
  console.log('[Logger] WebSocket Logger initialized');
  console.log('[Logger] Try: TizenLogger.testConnection()');
  console.log('[Logger] Try: TizenLogger.getStatus()');
  console.log('[Logger] ═══════════════════════════════════════');
}