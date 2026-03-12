/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  RECONNECTING WEBSOCKET — Auto-reconnect with exponential backoff
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Wraps native WebSocket with:
 * - Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (max)
 * - Jitter to prevent thundering herd
 * - Heartbeat ping/pong every 30s
 * - Auto state-recovery on reconnect (RESYNC handshake)
 * - Max 10 reconnect attempts, then CONNECTION_FAILED
 * - Bus event integration for UI status indicators
 */

import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected' | 'failed';

export interface ReconnectingWSOptions {
  /** Maximum reconnect attempts before giving up (default: 10) */
  maxRetries?: number;
  /** Initial backoff delay in ms (default: 1000) */
  initialDelay?: number;
  /** Maximum backoff delay in ms (default: 30000) */
  maxDelay?: number;
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;
  /** Message to send on reconnect for state recovery */
  resyncPayload?: () => Record<string, unknown>;
}

export interface WSMessage {
  type: string;
  payload?: unknown;
  version?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private options: Required<ReconnectingWSOptions>;
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private status: ConnectionStatus = 'disconnected';
  private intentionalClose = false;
  private messageHandlers: ((msg: WSMessage) => void)[] = [];
  private statusHandlers: ((status: ConnectionStatus) => void)[] = [];

  constructor(url: string, options: ReconnectingWSOptions = {}) {
    this.url = url;
    this.options = {
      maxRetries: options.maxRetries ?? 10,
      initialDelay: options.initialDelay ?? 1000,
      maxDelay: options.maxDelay ?? 30000,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      resyncPayload: options.resyncPayload ?? (() => ({})),
    };
  }

  // ─── Public API ───────────────────────────────────────────────────────

  connect(): void {
    this.intentionalClose = false;
    this.retryCount = 0;
    this.createConnection();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
    this.setStatus('disconnected');
  }

  send(message: WSMessage): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    console.warn('[ReconnectingWS] Cannot send — not connected');
    return false;
  }

  onMessage(handler: (msg: WSMessage) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter((h) => h !== handler);
    };
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getRetryCount(): number {
    return this.retryCount;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private createConnection(): void {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[ReconnectingWS] Connected');
        this.retryCount = 0;
        this.setStatus('connected');
        this.startHeartbeat();

        // Send RESYNC if this is a reconnection
        if (this.retryCount > 0) {
          const resyncPayload = this.options.resyncPayload();
          this.send({ type: 'RESYNC', payload: resyncPayload });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);

          // Handle heartbeat pong
          if (msg.type === 'PONG') return;

          // Dispatch to handlers
          for (const handler of this.messageHandlers) {
            try {
              handler(msg);
            } catch (err) {
              console.error('[ReconnectingWS] Handler error:', err);
            }
          }
        } catch {
          console.warn('[ReconnectingWS] Non-JSON message received');
        }
      };

      this.ws.onclose = (event) => {
        console.log(`[ReconnectingWS] Closed: code=${event.code} reason=${event.reason}`);
        this.stopHeartbeat();

        if (!this.intentionalClose) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('[ReconnectingWS] Error:', error);
        // onclose will fire after onerror — reconnect handled there
      };
    } catch (err) {
      console.error('[ReconnectingWS] Failed to create WebSocket:', err);
      if (!this.intentionalClose) {
        this.attemptReconnect();
      }
    }
  }

  private attemptReconnect(): void {
    if (this.retryCount >= this.options.maxRetries) {
      console.error(
        `[ReconnectingWS] Max retries (${this.options.maxRetries}) reached — giving up`
      );
      this.setStatus('failed');
      masterBus.emit('WS_CONNECTION_FAILED', { url: this.url, retries: this.retryCount });
      return;
    }

    this.retryCount++;
    this.setStatus('reconnecting');

    // Exponential backoff with jitter
    const baseDelay = Math.min(
      this.options.initialDelay * Math.pow(2, this.retryCount - 1),
      this.options.maxDelay
    );
    const jitter = Math.random() * baseDelay * 0.3; // 0-30% jitter
    const delay = baseDelay + jitter;

    console.log(
      `[ReconnectingWS] Reconnecting in ${Math.round(delay)}ms (attempt ${this.retryCount}/${this.options.maxRetries})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.createConnection();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'PING' });
      }
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;

    // Notify handlers
    for (const handler of this.statusHandlers) {
      try {
        handler(status);
      } catch (err) {
        console.error('[ReconnectingWS] Status handler error:', err);
      }
    }

    // Emit bus events for UI integration
    if (status === 'connected') {
      masterBus.emit('WS_CONNECTED', { url: this.url });
    } else if (status === 'reconnecting') {
      masterBus.emit('WS_RECONNECTING', { url: this.url, attempt: this.retryCount });
    } else if (status === 'disconnected') {
      masterBus.emit('WS_DISCONNECTED', { url: this.url });
    }
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'Intentional disconnect');
      }
      this.ws = null;
    }
  }
}

export default ReconnectingWebSocket;
