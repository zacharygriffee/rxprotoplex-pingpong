import {plexPingPong} from "./plexPingPong.js";

/**
 * Initiates a connection as the initiator on the provided Plex instance and manages
 * a ping-pong mechanism to monitor and maintain connection health. The initiator
 * periodically sends "ping" messages, expecting "pong" responses to confirm connectivity.
 *
 * The ping-pong mechanism starts automatically upon execution. The returned observable
 * allows users to monitor events such as "ping", "pong", and connection status changes.
 * It also supports graceful disconnection through cleanup when unsubscribed.
 *
 * @function connectAndPingPong$
 * @param {Object} plex - The Plex instance managing the underlying connection.
 * @param {Object} [config={}] - Optional configuration settings for the ping-pong mechanism.
 * @param {string|Uint8Array|Buffer} [config.channel=CHANNEL] - Communication channel identifier used for the connection.
 * @param {number} [config.interval=6000] - Heartbeat interval in milliseconds for sending pings and expecting pongs.
 * @param {number} [config.connectionTimeout=1000] - Timeout in milliseconds for detecting an inactive connection.
 * @param {number} [config.retryDelay=1000] - Delay in milliseconds between reconnection attempts.
 * @param {number} [config.reconnectAttemptCount=3] - Maximum number of reconnection attempts allowed before failing.
 * @param {boolean} [config.log=false] - Enables or disables logging of ping-pong events and connection states.
 * @param {Function} [config.onPingPongFailure] - Optional handler for managing ping-pong failures, invoked when the connection is deemed unhealthy.
 * @returns {Observable<{ type: string, plex: Object }>} An RxJS Observable that emits:
 *   - `{ type: 'ping', plex }` for sent ping events.
 *   - `{ type: 'pong', plex }` for received pong events.
 *   - Errors or completion signals when the connection is lost or closed.
 *
 * @example
 * const initiatorEvents$ = connectAndPingPong$(initiatorPlex, {
 *     channel: '$INITIATE_CHANNEL$',
 *     interval: 5000,
 *     log: true
 * });
 *
 * initiatorEvents$.subscribe({
 *     next: ({ type, plex }) => console.log(`Initiator event: ${type}`, plex),
 *     error: (err) => console.error(`Initiator error: ${err.message}`),
 *     complete: () => console.log('Initiator connection closed'),
 * });
 */

export const connectAndPingPong$ = (plex, config = {}) => {
    return plexPingPong(plex, true, config);
};
