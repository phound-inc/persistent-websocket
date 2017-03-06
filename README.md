[![Build Status](https://travis-ci.org/phound-inc/persistent-websocket.svg?branch=master)](https://travis-ci.org/phound-inc/persistent-websocket)
[![npm version](https://badge.fury.io/js/persistent-websocket.svg)](https://badge.fury.io/js/persistent-websocket)

# Persistent Websocket

An automatically-reconnecting websocket wrapper that respects server reachability and good backoff practices

### BETA QUALITY - Not a lot of production testing yet. Please report bugs!


## Features

* Optionally ping the backend (using a custom function) to make sure you're not on a zombie connection
* Optionally check for basic internet connectivity before trying to reconnect (via a configured url endpoint) 
* ["Decorrelated jitter"](https://www.awsarchitectureblog.com/2015/03/backoff.html) backoff
* [umd](https://github.com/umdjs/umd) / universal library
* Configurable timeouts, ping intervals, and backoff delay limits
* < 9kB minified


## Usage
```javascript
import {PersistentWebsocket} from "persistent-websocket";

const pws = new PersistentWebsocket("ws://mysite.com/", {
  pingSendFunction: (pws) => pws.send("ping"),
  reachabilityTestUrl: "/favicon.ico"  
});
pws.onmessage = (e) => console.log(e);
pws.onopen = (e) => console.log(e);
pws.onclose = (e) => console.log(e);
pws.onerror = (e) => console.log(e);

pws.open(); // Must be explicitly opened, unlike regular WebSocket

// Now you can use the PersistentWebsocket instance like a plain WebSocket instance, 
// except this instance will automatically try to reconnect if the connection dies 
```

The full list of available options is:
* `debug` _boolean_ (default `false`):  
Controls logging of verbose/debug output
* `initialBackoffDelayMillis` _numeric_ (default `500`):  
Delay before first reconnection attempt (also acts as a minimum delay)
* `maxBackoffDelayMillis` _numeric_ (default `120000`):  
Maximum delay between reconnection attempts
* `pingSendFunction` _function_ (no default):  
An optional function that takes the PersistentWebsocket instance as its only parameter.  
When left undefined, pings will not be performed.
* `pingIntervalSeconds` _numeric_ (default `30`):  
If the remote end of the websocket connection hasn't sent anything 
after this number of seconds, a ping will be sent (via `pingSendFunction`) to probe the connection.  
_Note that pings aren't sent at regular intervals. They're only sent when the line is otherwise quiet._
* `pingTimeoutMillis` _numeric_ (default `2000`):  
How long to wait for a ping response before calling the connection dead
* `connectTimeoutMillis` _numeric_ (default `3000`):  
How long to wait for the websocket connection to reach a `WebSocket.OPEN` ready state
* `reachabilityTestUrl` _string_ (no default):  
An optional url to use to test for internet connectivity (may be absolute or relative)   
A `HEAD` request will be sent to this url before trying to reconnect, and if it fails, the library will reset the 
backoff timing to its initial value and poll that url until it successfully responds.  
If left undefined, no reachability/internet connectivity check will be performed.
* `reachabilityTestTimeoutMillis` _numeric_ (default `2000`):  
How long to wait for a response from the `reachabilityTestUrl`
* `reachabilityPollingIntervalMillis` _numeric_ (default `3000`):  
How long to between a failed reachability test and the next request to the `reachabilityTestUrl`
 

## License
MIT
