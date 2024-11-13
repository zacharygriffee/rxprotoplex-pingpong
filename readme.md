# rxprotoplex-pingpong

A robust RxJS-based ping-pong mechanism leveraging `rxprotoplex` to maintain reliable, multiplexed connections over potentially unreliable networks. Ideal for applications requiring real-time communication with connection health checks, it provides a heartbeat mechanism to detect and handle connectivity issues seamlessly.

## Features

- **Heartbeat Mechanism**: Sends "ping" and expects "pong" to confirm connection status, helping detect connection issues.
- **Reactive Event Handling**: Built on RxJS for managing "ping", "pong", and error events via observables.
- **Multiplexed Streams**: Utilizes `rxprotoplex` to allow multiple channels over a single physical connection.
- **Error Handling and Cleanup**: Disconnects gracefully and emits errors when the connection is lost.

## Installation

```bash
npm install rxprotoplex-pingpong
```

## Usage

The library provides two main functions for managing connections: `connectAndPingPong$` for initiators and `listenAndConnectionAndPingPong$` for listeners. Both functions emit an observable that provides `{ type, plex }` for each event, where `type` is either `"ping"` or `"pong"`, and `plex` is the connection responsible for the event.

### Initiating a Connection with `connectAndPingPong$`

Use `connectAndPingPong$` to initiate a connection that will send "ping" messages at regular intervals, maintaining a heartbeat with the listener.

```javascript
import { createPlexPair } from 'rxprotoplex';
import { connectAndPingPong$, listenAndConnectionAndPingPong$ } from 'rxprotoplex-pingpong';

// Create Plex instances
const [initiatorPlex, listenerPlex] = createPlexPair();

// Initiator starts ping-pong
const initiatorEvents$ = connectAndPingPong$(initiatorPlex, { channel: '$PINGPONG$', interval: 1000 });
initiatorEvents$.subscribe({
    next: ({ type, plex }) => console.log(`Initiator event: ${type} on plex:`, plex),
    error: (err) => console.error(`Initiator error: ${err.message}`),
    complete: () => console.log('Initiator connection completed')
});
```

### Listening for a Connection with `listenAndConnectionAndPingPong$`

Use `listenAndConnectionAndPingPong$` to set up a listening connection that responds with "pong" to received "ping" messages, keeping the connection alive.

```javascript
const listenerEvents$ = listenAndConnectionAndPingPong$(listenerPlex, { channel: '$PINGPONG$', interval: 1000 });
listenerEvents$.subscribe({
    next: ({ type, plex }) => console.log(`Listener event: ${type} on plex:`, plex),
    error: (err) => console.error(`Listener error: ${err.message}`),
    complete: () => console.log('Listener connection completed')
});
```

### Options

Both `connectAndPingPong$` and `listenAndConnectionAndPingPong$` accept the following options:

- **channel** (`string | Uint8Array | Buffer`): The channel identifier for the connection. Can be a `string`, `Uint8Array`, or `Buffer`. Default is `$PINGPONG$`.
- **interval** (number): Interval (in milliseconds) between "ping" messages. Default is 6000.
- **log** (boolean): Enables console logging for connection events. Default is `true`.
- **onPingPongFailure** (function): Optional custom handler to manage ping-pong failures (e.g., custom reconnection logic).

### Example with Custom Error Handling

You can provide a custom handler to control the behavior when the ping-pong mechanism detects a connectivity issue.

```javascript
const initiatorEvents$ = connectAndPingPong$(initiatorPlex, {
    channel: '$CUSTOM_PINGPONG$',
    interval: 2000,
    onPingPongFailure: (error) => {
        console.warn('Custom handler: Connection lost. Attempting reconnection...');
        // Reconnection or fallback logic here
    }
});
```

## API

### `connectAndPingPong$(plex, config)`

Initiates a connection over the provided `plex` instance and returns an observable that emits "ping" and "pong" events, along with connection status updates.

- **plex**: The `plex` instance from `rxprotoplex`.
- **config** (object): Configuration options (see Options section above).

**Returns**: An RxJS Observable with:
- `{ type: 'ping', plex }` for sent pings
- `{ type: 'pong', plex }` for received pongs
- An error or completion signal when the connection is lost

### `listenAndConnectionAndPingPong$(plex, config)`

Creates a listening connection on the provided `plex` instance. The function returns an observable for managing and monitoring connection events.

- **plex**: The `plex` instance from `rxprotoplex`.
- **config** (object): Configuration options (see Options section above).

**Returns**: An RxJS Observable similar to `connectAndPingPong$`, emitting `{ type, plex }` on each event.

## Testing

To run tests, ensure `brittle` is installed as a dev dependency. Then, execute:

```bash
npm test
```

Tests cover key functionalities, such as:
- **Ping-Pong Communication**: Ensures initiators and listeners exchange heartbeat signals correctly.
- **Disconnection Handling**: Validates responses to timeouts or manual disconnections.
- **Error Propagation**: Confirms that errors are handled and emitted as expected.

## License

MIT License
