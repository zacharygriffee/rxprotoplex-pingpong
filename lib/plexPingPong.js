import { Observable, Subject, ReplaySubject, fromEvent, EMPTY, interval, take } from 'rxjs';
import { takeUntil, filter, tap, finalize, switchMap, catchError, timeout, retry } from 'rxjs/operators';
import { CHANNEL } from "./CHANNEL.js";
import { connect$, listenAndConnection$, withEncoding } from "rxprotoplex";

/**
 * Manages a ping-pong mechanism over a Plex connection.
 *
 * @param {Object} plex - The Plex connection object.
 * @param {boolean} isInitiator - Flag indicating if this instance initiates the connection.
 * @param {Object} config - Configuration options.
 * @param {string | Uint8Array | Buffer} config.channel - The communication channel.
 * @param {number} config.interval - Interval for ping-pong messages in milliseconds.
 * @param {boolean} config.log - Flag to enable or disable logging.
 * @param {Function} [config.onPingPongFailure] - Optional custom handler for ping-pong failures.
 * @returns {Observable} - An observable emitting { type, plex } events.
 */
const plexPingPong = (plex, isInitiator, config = {}) => {
    const {
        channel = CHANNEL,
        interval: _interval = 6000,
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
                retry({ delay: 1000, count: Infinity, resetOnSuccess: true }),
                finalize(() => logMessage('info', `Connection on channel '${channel}' finalized`))
            ).subscribe({
                error: (err) => logMessage('error', `Connection error on channel '${channel}': ${err.message}`),
                complete: () => logMessage('warn', `Connection on channel '${channel}' has been completed.`)
            });
        };

        const listenConnection = () => {
            return listenAndConnection$(plex, channel, withEncoding('json')).pipe(
                takeUntil(disconnect$),
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
                retry({ delay: 1000, count: Infinity, resetOnSuccess: true }),
                finalize(() => logMessage('info', `Listener on channel '${channel}' finalized`))
            ).subscribe({
                error: (err) => logMessage('error', `Listener error on channel '${channel}': ${err.message}`),
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
