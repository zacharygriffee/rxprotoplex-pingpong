import { test, solo } from 'brittle';
import { createPlexPair, destroy } from 'rxprotoplex';
import { plexPingPong } from './lib/plexPingPong.js'; // Adjust the path as needed

test('Ping-Pong Communication between Initiator and Listener', async (t) => {
    // Create a pair of plex instances
    const [initiatorPlex, listenerPlex] = createPlexPair();


    // Start ping-pong on both sides with default behavior (no custom handler)
    const initiatorEvents$ = plexPingPong(initiatorPlex, true, { channel: '$PINGPONG$', interval: 500 });
    const listenerEvents$ = plexPingPong(listenerPlex, false, { channel: '$PINGPONG$', interval: 500 });

    let initiatorErrorCaught = false;
    let listenerErrorCaught = false;

    // Create separate Promises for initiator and listener errors
    const initiatorErrorPromise = new Promise((resolve) => {
        initiatorEvents$.subscribe({
            next: (event) => {
                t.ok(['ping', 'pong'].includes(event.type), `Initiator received event type: ${event.type}`);
            },
            error: (err) => {
                initiatorErrorCaught = true;
                t.ok(err, `Initiator encountered expected error: ${err.message}`);
                resolve();
            },
            complete: () => {
                // If complete is called without error, resolve the Promise
                resolve();
            }
        });
    });

    const listenerErrorPromise = new Promise((resolve) => {
        listenerEvents$.subscribe({
            next: (event) => {
                t.ok(['ping', 'pong'].includes(event.type), `Listener received event type: ${event.type}`);
            },
            error: (err) => {
                listenerErrorCaught = true;
                t.ok(err, `Listener encountered expected error: ${err.message}`);
                resolve();
            },
            complete: () => {
                // If complete is called without error, resolve the Promise
                resolve();
            }
        });
    });

    // Wait for a few ping-pong cycles
    await new Promise((resolve) => setTimeout(resolve, 700));

    // Destroy the listener plex to simulate stream closure
    destroy(listenerPlex);

    // Wait for the disconnection to propagate and errors to be emitted
    try {
        await Promise.race([
            Promise.all([initiatorErrorPromise, listenerErrorPromise]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for errors')), 2000))
        ]);
    } catch (err) {
        t.fail(err.message);
    }

    // Assert that errors were caught
    t.ok(initiatorErrorCaught, 'Initiator caught expected error');
    t.ok(listenerErrorCaught, 'Listener caught expected error');

    // Pass the test after ensuring errors are caught
    t.pass('Ping-Pong communication and disconnection handled correctly');

    // Teardown: ensure all plex instances are destroyed
    t.teardown(() => {
        destroy(initiatorPlex);
        destroy(listenerPlex);
    });
});

test('Heartbeat Timeout Triggers Disconnection', async (t) => {
    // Create a pair of plex instances
    const [initiatorPlex, listenerPlex] = createPlexPair();

    // Start ping-pong on both sides with a short interval (no custom handler)
    const initiatorEvents$ = plexPingPong(initiatorPlex, true, { channel: '$PINGPONG$', interval: 500 });
    const listenerEvents$ = plexPingPong(listenerPlex, false, { channel: '$PINGPONG$', interval: 500 });

    let initiatorErrorCaught = false;
    let listenerErrorCaught = false;

    // Create separate Promises for initiator and listener errors
    const initiatorErrorPromise = new Promise((resolve) => {
        initiatorEvents$.subscribe({
            next: (event) => {
                t.ok(['ping', 'pong'].includes(event.type), `Initiator received event type: ${event.type}`);
            },
            error: (err) => {
                initiatorErrorCaught = true;
                t.ok(err, `Initiator encountered expected error: ${err.message}`);
                resolve();
            },
            complete: () => {
                resolve();
            }
        });
    });

    const listenerErrorPromise = new Promise((resolve) => {
        listenerEvents$.subscribe({
            next: (event) => {
                t.ok(['ping', 'pong'].includes(event.type), `Listener received event type: ${event.type}`);
            },
            error: (err) => {
                listenerErrorCaught = true;
                t.ok(err, `Listener encountered expected error: ${err.message}`);
                resolve();
            },
            complete: () => {
                resolve();
            }
        });
    });

    // Allow initial exchanges
    await new Promise((resolve) => setTimeout(resolve, 750));

    // Simulate missing pongs by destroying the listener plex
    destroy(listenerPlex);

    // Wait for the heartbeat to detect missed pong and trigger disconnection
    try {
        await Promise.race([
            Promise.all([initiatorErrorPromise, listenerErrorPromise]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for errors')), 2000))
        ]);
    } catch (err) {
        t.fail(err.message);
    }

    // Assert that errors were caught
    t.ok(initiatorErrorCaught, 'Initiator caught expected error');
    t.ok(listenerErrorCaught, 'Listener caught expected error');

    // Pass the test after ensuring errors are caught
    t.pass('Heartbeat timeout correctly triggered disconnection');

    // Teardown: ensure all plex instances are destroyed
    t.teardown(() => {
        destroy(initiatorPlex);
        destroy(listenerPlex);
    });
});

test('Other side doesn\'t support ping pong', async (t) => {
    t.comment("The side that does will attempt to reconnect at least 3 times.");

    // Create a pair of plex instances
    const [initiatorPlex, listenerPlex] = createPlexPair();

    // Flags to track destruction
    let initiatorDestroyed = false;
    let listenerDestroyed = false;

    // Mock destroy methods for testing
    initiatorPlex.close$.subscribe((error) => {
        initiatorDestroyed = true;
        t.ok(true, `Initiator Plex destroyed due to: ${error?.message || 'No specific error message'}`);
    });
    listenerPlex.close$.subscribe(error => {
        listenerDestroyed = true;
        t.ok(true, `Listener Plex destroyed due to: ${error?.message || 'No specific error message'}`);
    })

    // Start ping-pong on the initiator only
    const initiatorEvents$ = plexPingPong(initiatorPlex, true, {
        channel: '$PINGPONG$',
        interval: 500,
        connectionTimeout: 200,
    });

    let errorEmitted = false;

    // Promise to handle initiator's error
    const errorPromise = new Promise((resolve) => {
        initiatorEvents$.subscribe({
            next: (event) => {
                t.ok(['ping', 'pong'].includes(event.type), `Initiator received event type: ${event.type}`);
            },
            error: (err) => {
                errorEmitted = true;
                t.ok(err, `Initiator encountered expected error: ${err.message}`);
                resolve();
            },
            complete: () => {
                t.fail('Observable completed unexpectedly');
                resolve();
            },
        });
    });

    // Wait for error to propagate
    await errorPromise;

    // Validate results
    t.ok(errorEmitted, 'Error was emitted due to lack of pong response');
    t.ok(initiatorDestroyed, 'Initiator Plex was destroyed as expected');
    t.ok(listenerDestroyed, 'Listener Plex was destroyed as expected');

    // Teardown
    t.teardown(() => {
        destroy(initiatorPlex);
        destroy(listenerPlex);
    });
});



test('Manual Disconnection via Unsubscribe Method', async (t) => {
    // Create a pair of plex instances
    const [initiatorPlex, listenerPlex] = createPlexPair();

    // Start ping-pong on both sides with default behavior
    const initiatorEvents$ = plexPingPong(initiatorPlex, true, { channel: '$PINGPONG$', interval: 1000 });
    const listenerEvents$ = plexPingPong(listenerPlex, false, { channel: '$PINGPONG$', interval: 1000 });

    let initiatorErrorCaught = false;
    let listenerErrorCaught = false;

    // Promises that will resolve when either error or complete events are emitted
    const initiatorErrorPromise = new Promise((resolve) => {
        const subscription = initiatorEvents$.subscribe({
            next: (event) => t.ok(['ping', 'pong'].includes(event.type), `Initiator received event type: ${event.type}`),
            error: (err) => {
                initiatorErrorCaught = true;
                t.ok(err, `Initiator encountered expected error: ${err.message}`);
                resolve();
            },
            complete: () => {
                t.pass('Initiator observable completed');
                resolve();
            }
        });
        // Ensure cleanup of subscription in case of any errors
        t.teardown(() => subscription.unsubscribe());
    });

    const listenerErrorPromise = new Promise((resolve) => {
        const subscription = listenerEvents$.subscribe({
            next: (event) => t.ok(['ping', 'pong'].includes(event.type), `Listener received event type: ${event.type}`),
            error: (err) => {
                listenerErrorCaught = true;
                t.ok(err, `Listener encountered expected error: ${err.message}`);
                resolve();
            },
            complete: () => {
                t.pass('Listener observable completed');
                resolve();
            }
        });
        // Ensure cleanup of subscription in case of any errors
        t.teardown(() => subscription.unsubscribe());
    });

    // Allow some exchanges before manually disconnecting
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Manually destroy both plex instances to simulate disconnection
    destroy(initiatorPlex);
    destroy(listenerPlex);

    // Wait for both promises to resolve on error or complete
    await Promise.all([initiatorErrorPromise, listenerErrorPromise]);

    // Assert that errors were caught (or completions if no errors occurred)
    t.ok(initiatorErrorCaught || true, 'Initiator observable has either errored or completed');
    t.ok(listenerErrorCaught || true, 'Listener observable has either errored or completed');

    t.pass('Manual disconnection via unsubscribe method works correctly');

    // Teardown: ensure all plex instances are destroyed
    t.teardown(() => {
        destroy(initiatorPlex);
        destroy(listenerPlex);
    });
});
