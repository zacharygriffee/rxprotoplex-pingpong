import {plexPingPong} from "./plexPingPong.js";

/**
 * Creates a listening connection on the provided Plex instance and manages a ping-pong
 * mechanism to keep the connection alive. The function starts the ping-pong immediately
 * upon execution, while the returned observable allows the user to monitor ping/pong events.
 *
 * @function listenAndConnectionAndPingPong$
 * @param {Object} plex - The Plex instance managing the underlying connection.
 * @param {Object} [config={}] - Optional configuration settings for the ping-pong mechanism.
 * @param {string} [config.channel=CHANNEL] - Communication channel used for the connection.
 * @param {number} [config.interval=6000] - Heartbeat interval in milliseconds for sending pings and expecting pongs.
 * @returns {Observable} An observable that emits ping and pong events, along with connection status events.
 *                       The observable includes a `DISCONNECT` method for manually ending the connection.
 */
export const listenAndConnectionAndPingPong$ = (plex, config = {}) => {
    return plexPingPong(plex, false, config);
};
