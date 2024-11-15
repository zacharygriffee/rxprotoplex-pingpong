import { Observable, Subject, ReplaySubject, fromEvent, EMPTY, interval, take } from 'rxjs';
import { takeUntil, filter, tap, finalize, switchMap, catchError, timeout, retry } from 'rxjs/operators';
import { CHANNEL } from "./CHANNEL.js";
import {connect$, destroy, listenAndConnection$, withEncoding} from "rxprotoplex";

/**
 * Manages a ping-pong mechanism over a Plex connection to maintain connectivity.
 * It supports error handling, reconnection logic, and customizable behavior.
 *
 * @param {Object} plex - The Plex connection object that facilitates communication.
 * @param {boolean} isInitiator - Specifies whether this instance initiates the connection.
 * @param {Object} [config] - Configuration options for the ping-pong mechanism.
 * @param {string | Uint8Array | Buffer} [config.channel=CHANNEL] - The communication channel used for messages.
 * @param {number} [config.interval=6000] - Interval (in milliseconds) between ping-pong messages.
 * @param {number} [config.connectionTimeout=1000] - Timeout (in milliseconds) for initial connection setup.
 * @param {number} [config.retryDelay=1000] - Delay (in milliseconds) between reconnection attempts.
 * @param {number} [config.reconnectAttemptCount=3] - Maximum number of reconnection attempts before giving up.
 * @param {boolean} [config.log=false] - Enables logging of connection and ping-pong events.
 * @param {Function} [config.onPingPongFailure] - Optional custom handler for ping-pong failures.
 *     If provided, errors will not propagate to the observable.
 *     The handler receives an `Error` object as its argument.
 * @returns {Observable<{ type: string, plex: Object }>} - An observable that emits events:
 *     - `type: 'ping'` when a ping message is sent or received.
 *     - `type: 'pong'` when a pong message is received.
 *     - Includes the `plex` object for context.
 *
 * @example
 * const subscription = plexPingPong(plex, true, {
 *     channel: '$PINGPONG$',
 *     interval: 5000,
 *     log: true,
 *     onPingPongFailure: (err) => console.error('Ping-Pong failed:', err.message),
 * }).subscribe({
 *     next: (event) => console.log('Ping-Pong event:', event),
 *     error: (err) => console.error('Connection error:', err),
 *     complete: () => console.log('Connection closed'),
 * });
 *
 * // To clean up:
 * subscription.unsubscribe();
 */
const plexPingPong = (plex, isInitiator, config = {}) => {
    const {
        channel = CHANNEL,
        interval: _interval = 6000,
        connectionTimeout = 1000, // Default timeout for connection setup
        retryDelay = 1000,
        reconnectAttemptCount = 3,
        log = false,
        onPingPongFailure // Custom handler for failures
    } = config;

    // Helper function for conditional logging
    const logMessage = (level, message) => {
        if (log) {
            switch (level) {
                case 'info':
                    console.info(message);
                    break;
                case 'warn':
                    console.warn(message);
                    break;
                case 'error':
                    console.error(message);
                    break;
                default:
                    console.log(message);
            }
        }
    };

    const obs = new Observable((subscriber) => {
        const disconnect$ = new Subject();
        let isDisconnected = false;
        const heartbeatSubject = new Subject();
        let pingSubscription;

        const performDisconnect = (error) => {
            if (!isDisconnected) {
                isDisconnected = true;
                disconnect$.next();
                disconnect$.complete();
                heartbeatSubject.complete();

                if (pingSubscription) {
                    pingSubscription.unsubscribe();
                }

                logMessage('info', `performDisconnect called for channel '${channel}'.`);

                // Call destroy on the Plex instance
                if (!plex.destroyed) {
                    destroy(plex/*, error || new Error('Ping-Pong failure detected')*/);
                }

                if (onPingPongFailure && typeof onPingPongFailure === 'function') {
                    try {
                        onPingPongFailure(error || new Error('Ping-Pong failure detected'));
                    } catch (handlerError) {
                        logMessage('error', `Error in onPingPongFailure handler: ${handlerError.message}`);
                    }
                }

                if (!onPingPongFailure) {
                    logMessage('info', `Emitting error for channel '${channel}': ${error.message}`);
                    subscriber.error(error || new Error('Ping-Pong failure detected'));
                }
            } else {
                logMessage('warn', `performDisconnect called again for channel '${channel}' but is already disconnected.`);
            }
        };


        const handleStream = (stream) => {
            const data$ = fromEvent(stream, 'data').pipe(
                takeUntil(disconnect$),
                filter(data => data === "ping" || data === "pong"),
                tap((msg) => {
                    if (msg === 'ping') {
                        stream.write("pong");
                        logMessage('info', `Received 'ping' on channel '${channel}'. Responded with 'pong'.`);
                        subscriber.next({ type: 'ping', plex });
                    } else if (msg === 'pong') {
                        heartbeatSubject.next();
                        logMessage('info', `Received 'pong' on channel '${channel}'. Connection is active.`);
                        subscriber.next({ type: 'pong', plex });
                    }
                }),
                finalize(() => logMessage('info', `data$ finalized for channel '${channel}'`))
            );

            return data$.subscribe({
                error: (err) => {
                    logMessage('error', `Stream error on channel '${channel}': ${err.message}`);
                    performDisconnect(err);
                },
                complete: () => {
                    logMessage('warn', `Stream on channel '${channel}' has been completed unexpectedly or closed.`);
                    performDisconnect(new Error('Stream completed unexpectedly'));
                }
            });
        };

        const heartbeat$ = heartbeatSubject.pipe(
            takeUntil(disconnect$),
            switchMap(() => EMPTY.pipe(
                timeout(_interval),
                catchError((err) => {
                    logMessage('error', `Connection lost due to missed 'pong' on channel '${channel}'.`);
                    performDisconnect(err);
                    return EMPTY;
                })
            )),
            finalize(() => logMessage('info', `heartbeat$ finalized for channel '${channel}'`))
        );

        const heartbeatSubscription = heartbeat$.subscribe();

        const initiateConnection = () => {
            return connect$(plex, channel, withEncoding('json')).pipe(
                takeUntil(disconnect$),
                timeout(connectionTimeout), // Timeout for initial connection setup
                switchMap((stream) => {
                    const streamSubscription = handleStream(stream);

                    if (isInitiator) {
                        pingSubscription = interval(_interval / 2).pipe(
                            takeUntil(disconnect$)
                        ).subscribe(() => {
                            if (!stream.destroyed) {
                                stream.write("ping");
                                logMessage('info', `Sent 'ping' on channel '${channel}' to maintain connection.`);
                                subscriber.next({ type: 'ping', plex });
                            } else {
                                performDisconnect(new Error('Stream destroyed'));
                                logMessage('info', `Stream destroyed for channel '${channel}'. Triggering disconnection.`);
                            }
                        });
                    }

                    return disconnect$.pipe(
                        tap(() => {
                            if (!stream.destroyed) {
                                stream.destroy();
                                logMessage('info', `Stream destroyed for channel '${channel}'.`);
                            }
                            streamSubscription.unsubscribe();
                            if (isInitiator && pingSubscription) {
                                pingSubscription.unsubscribe();
                            }
                        }),
                        take(1)
                    );
                }),
                retry({ delay: retryDelay, count: reconnectAttemptCount, resetOnSuccess: true }),
                finalize(() => logMessage('info', `Connection on channel '${channel}' finalized`))
            ).subscribe({
                error: (err) => {
                    logMessage('error', `Connection error on channel '${channel}': ${err.message}`);
                    performDisconnect(err); // Ensure cleanup on timeout or failure
                },
                complete: () => logMessage('warn', `Connection on channel '${channel}' has been completed.`)
            });
        };

        const listenConnection = () => {
            return listenAndConnection$(plex, channel, withEncoding('json')).pipe(
                takeUntil(disconnect$),
                timeout(connectionTimeout), // Timeout for initial connection setup
                switchMap((stream) => {
                    const streamSubscription = handleStream(stream);

                    return disconnect$.pipe(
                        tap(() => {
                            if (!stream.destroyed) {
                                stream.destroy();
                                logMessage('info', `Stream destroyed for channel '${channel}'.`);
                            }
                            streamSubscription.unsubscribe();
                        }),
                        take(1)
                    );
                }),
                retry({ delay: retryDelay, count: reconnectAttemptCount, resetOnSuccess: true }),
                finalize(() => logMessage('info', `Listener on channel '${channel}' finalized`))
            ).subscribe({
                error: (err) => {
                    logMessage('error', `Listener error on channel '${channel}': ${err.message}`);
                    performDisconnect(err); // Ensure cleanup on timeout or failure
                },
                complete: () => logMessage('warn', `Listener on channel '${channel}' has been completed.`)
            });
        };

        const plexCloseSubscription = plex.close$.subscribe(() => {
            logMessage('warn', `>>>>>>>> Plex closes on channel '${channel}'.`);
            performDisconnect(new Error('Plex connection closed'));
        });

        const connectionSubscription = isInitiator ? initiateConnection() : listenConnection();

        heartbeatSubject.next();

        return () => {
            performDisconnect(new Error('Unsubscribed'));
            plexCloseSubscription.unsubscribe();
            connectionSubscription.unsubscribe();
            heartbeatSubscription.unsubscribe();
            if (pingSubscription) {
                pingSubscription.unsubscribe();
            }
            logMessage('info', `Teardown complete for channel '${channel}'.`);
        };
    }).pipe(
        finalize(() => logMessage('info', `Observable completed and disconnected for channel '${channel}'`))
    );

    return obs;
};

export { plexPingPong };
