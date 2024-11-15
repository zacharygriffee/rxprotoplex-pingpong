# rxprotoplex-pingpong

A robust RxJS-based ping-pong mechanism leveraging `rxprotoplex` to maintain reliable, multiplexed connections over potentially unreliable networks. Designed for applications requiring real-time communication with connection health checks, it provides a heartbeat mechanism to detect and handle connectivity issues seamlessly.

## Features

- **Heartbeat Mechanism**: Sends "ping" and expects "pong" to confirm connection status, detecting and handling issues.
- **Reactive Event Handling**: Built on RxJS for efficient management of "ping", "pong", and error events via observables.
- **Multiplexed Streams**: Utilizes `rxprotoplex` to support multiple logical channels over a single physical connection.
- **Customizable Error Handling**: Offers options for soft error handling or propagating failures as needed.
- **Graceful Cleanup**: Ensures proper resource management and disconnection handling.

## Installation

```bash
npm install rxprotoplex-pingpong
```

## Usage

The library provides two main functions to manage connections:

- `connectAndPingPong$`: Use this function to initiate a connection and periodically send "ping" messages.
- `listenAndConnectionAndPingPong$`: Use this function to listen for incoming connections and respond with "pong" messages.

Each function returns an observable that emits `{ type, plex }` for each event, where `type` is either `"ping"` or `"pong"`, and `plex` is the associated connection.

### Example: Initiating a Ping-Pong Connection

Use `connectAndPingPong$` to initiate a connection that sends "ping" messages at regular intervals.

```javascript
import { createPlexPair } from 'rxprotoplex';
import { connectAndPingPong$ } from 'rxprotoplex-pingpong';

// Create Plex instances
const [initiatorPlex, listenerPlex] = createPlexPair();

// Initiator starts ping-pong
const initiatorEvents$ = connectAndPingPong$(initiatorPlex, { 
    channel: '$PINGPONG$', 
    interval: 1000, 
    log: true 
});
initiatorEvents$.subscribe({
    next: ({ type, plex }) => console.log(`Initiator event: ${type} on plex:`, plex),
    error: (err) => console.error(`Initiator error: ${err.message}`),
    complete: () => console.log('Initiator connection completed'),
});
```

### Example: Listening for a Ping-Pong Connection

Use `listenAndConnectionAndPingPong$` to set up a listener connection that responds with "pong" to "ping" messages, keeping the connection alive.

```javascript
import { listenAndConnectionAndPingPong$ } from 'rxprotoplex-pingpong';

const listenerEvents$ = listenAndConnectionAndPingPong$(listenerPlex, { 
    channel: '$PINGPONG$', 
    interval: 1000, 
    log: true 
});
listenerEvents$.subscribe({
    next: ({ type, plex }) => console.log(`Listener event: ${type} on plex:`, plex),
    error: (err) => console.error(`Listener error: ${err.message}`),
    complete: () => console.log('Listener connection completed'),
});
```

---

## Configuration Options

The functions `connectAndPingPong$` and `listenAndConnectionAndPingPong$` accept a `config` object with the following options:

| Option               | Type                       | Default       | Description                                                                 |
|----------------------|----------------------------|---------------|-----------------------------------------------------------------------------|
| **channel**          | `string \| Uint8Array \| Buffer` | `$PINGPONG$` | The channel identifier for the connection.                                 |
| **interval**         | `number`                  | `6000`        | Interval (in milliseconds) between "ping" messages.                        |
| **connectionTimeout**| `number`                  | `1000`        | Timeout (in milliseconds) for initial connection setup.                    |
| **retryDelay**       | `number`                  | `1000`        | Delay (in milliseconds) between reconnection attempts.                     |
| **reconnectAttemptCount** | `number`             | `3`           | Maximum number of reconnection attempts before giving up.                  |
| **log**              | `boolean`                 | `false`       | Enables console logging for connection events.                             |
| **onPingPongFailure**| `Function`                | `undefined`   | Custom handler for ping-pong failures (e.g., custom reconnection logic).   |

---

## Advanced Example: Custom Failure Handling

You can provide a custom handler to manage connection failures without propagating errors, allowing for custom reconnection logic or other actions.

```javascript
const initiatorEvents$ = connectAndPingPong$(initiatorPlex, {
    channel: '$CUSTOM_CHANNEL$',
    interval: 2000,
    log: true,
    onPingPongFailure: (error) => {
        console.warn('Custom handler: Connection lost.', error.message);
        // Implement reconnection or other fallback logic here
    },
});
```

---

## Testing

To run tests, ensure `brittle` is installed as a dev dependency. Then, execute:

```bash
npm test
```

### Test Coverage:
- **Heartbeat Communication**: Validates the proper exchange of "ping" and "pong" messages.
- **Disconnection Handling**: Ensures correct handling of connection timeouts or closures.
- **Error Propagation**: Confirms that errors are emitted or handled as per the configuration.

---

## API Reference

### `connectAndPingPong$(plex, config)`

Initiates a connection as the initiator on the provided Plex instance and manages a ping-pong mechanism to maintain connection health.

#### Parameters:
- **plex**: The Plex connection object from `rxprotoplex`.
- **config**: Configuration object (see [Options](#configuration-options)).

#### Returns:
An RxJS Observable that emits:
- `{ type: 'ping', plex }` for sent pings.
- `{ type: 'pong', plex }` for received pongs.
- Error or completion signals when the connection is lost or closed.

---

### `listenAndConnectionAndPingPong$(plex, config)`

Creates a listening connection on the provided Plex instance, automatically responding to ping messages to maintain connection health.

#### Parameters:
- **plex**: The Plex connection object from `rxprotoplex`.
- **config**: Configuration object (see [Options](#configuration-options)).

#### Returns:
An RxJS Observable that emits:
- `{ type: 'ping', plex }` for sent pings.
- `{ type: 'pong', plex }` for received pongs.
- Error or completion signals when the connection is lost or closed.

---

## License

MIT License