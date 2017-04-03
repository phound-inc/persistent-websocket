import Backoff from "./backoff";

export const READYSTATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

export const defaultOptions = {
  debug: false,
  initialBackoffDelayMillis: 500,
  maxBackoffDelayMillis: 120000,
  pingSendFunction: null, // Function that takes the PersistentWebsocket instance as its only parameter
  pingIntervalSeconds: 30,
  pingTimeoutMillis: 2000,
  connectTimeoutMillis: 3000,
  reachabilityTestUrl: null,
  reachabilityTestTimeoutMillis: 2000,
  reachabilityPollingIntervalMillis: 3000,
  xhrConstructor: null,
  websocketConstructor: null,
};

function noop() {
}

export class AttemptReconnectEvent {
  constructor(attemptNumber, waitMillis) {
    this.attemptNumber = attemptNumber;
    this.waitMillis = waitMillis;
  }
}

export class PersistentWebsocket {
  constructor(url, protocols, options = {}) {
    if (typeof(protocols) === "object") {
      options = protocols;
      protocols = undefined;
    }

    this.onopen = noop;
    this.onclose = noop;
    this.onmessage = noop;
    this.onerror = noop;
    this.onbeforereconnect = noop;

    this._handlers = {
      open: [],
      close: [],
      message: [],
      error: [],
      beforereconnect: []
    };
    this._url = url;
    this._protocols = protocols;
    this._options = Object.assign({}, defaultOptions, options);
    this._backoff = new Backoff(this._options.initialBackoffDelayMillis, this._options.maxBackoffDelayMillis);
    this._waitingForPong = false;
    this._manuallyClosed = false;
    this._hasConnected = false;
    this._retryCount = 0;

    this._pingTimeoutId = 0;
    this._scheduledReconnectTimeoutId = 0;
    this._websocketConnectionCheckTimeoutId = 0;
    this._reachabilityCheckTimeoutId = 0;

    this._websocketConstructor = this._options.websocketConstructor || WebSocket;
    this._xhrConstructor = this._options.xhrConstructor || XMLHttpRequest;
  }

  _openWebsocket() {
    this._debugLog("Trying to open websocket");
    const ws = new this._websocketConstructor(this._url, this._protocols);
    if (this._binaryType) {
      ws.binaryType = this._binaryType;
    }
    ws.onclose = this._onWebsocketClose.bind(this);
    ws.onerror = this._onWebsocketError.bind(this);
    ws.onmessage = this._onWebsocketMessage.bind(this);
    ws.onopen = this._onWebsocketOpen.bind(this);
    this._websocket = ws;

    this._scheduleWebsocketConnectionCheck();
  }

  _callHandlers(eventName, event) {
    if (this._handlers[eventName]) {
      this._handlers[eventName].forEach(handler => handler(event));
    }
  }

  _onWebsocketClose(event) {
    event.wasExpected = this._manuallyClosed;
    this.onclose(event);
    this._callHandlers("close", event);
    if (!this._manuallyClosed) {
      this._checkReachabilityAndScheduleReconnect();
    }
  }

  _onWebsocketError(event) {
    this.onerror(event);
    this._callHandlers("error", event);
  }

  _onWebsocketMessage(event) {
    // Any message counts as a "pong"
    this._waitingForPong = false;

    // Reschedule ping so pings only occur when the inbound side of the connection is quiet for ${pingIntervalSeconds}
    this._schedulePing();

    this.onmessage(event);
    this._callHandlers("message", event);
  }

  _onWebsocketOpen(event) {
    event.wasReconnect = this._hasConnected;
    this.onopen(event);
    this._callHandlers("open", event);
    this._hasConnected = true;
    this._retryCount = 0;

    if (event.target.readyState == READYSTATE.OPEN) {
      // Start pings
      this._schedulePing();
      this._cancelWebsocketConnectionCheck();
    }
  }

  _sendPing() {
    this._debugLog("Pinging websocket...");
    this._waitingForPong = true;
    this._options.pingSendFunction(this);
    setTimeout(this._checkPingResult.bind(this), this._options.pingTimeoutMillis);
  }

  _schedulePing() {
    // Always clear out any existing scheduled pings
    if (this._pingTimeoutId) {
      this._cancelPing();
    }

    const {pingSendFunction, pingIntervalSeconds} = this._options;
    if (pingSendFunction && pingIntervalSeconds) {
      this._pingTimeoutId = setTimeout(this._sendPing.bind(this), pingIntervalSeconds * 1000);
    }
  }

  _cancelPing() {
    clearTimeout(this._pingTimeoutId);
    this._pingTimeoutId = 0;
  }

  _checkPingResult() {
    if (this._waitingForPong) {
      this._debugLog("Closing websocket due to ping failure.");
      this._websocket.close(4001, "Closing websocket due to ping failure.");
    }
  }

  _checkReachabilityAndScheduleReconnect() {
    if (!this._options.reachabilityTestUrl) {
      this._scheduleReconnect();
    } else {
      const xhr = new this._xhrConstructor();
      xhr.open("HEAD", this._options.reachabilityTestUrl);
      xhr.timeout = this._options.reachabilityTestTimeoutMillis;
      xhr.onload = () => {
        this._reachabilityCheckTimeoutId = 0;
        this._debugLog(`ONLINE: HEAD request to ${this._options.reachabilityTestUrl} succeeded.`);
        this._scheduleReconnect();
      };
      const retryLater = () => {
        // Check if online again in 3 seconds
        this._debugLog(`OFFLINE: Unable to reach ${this._options.reachabilityTestUrl}.\nTrying again in 3s.`);
        this._backoff.reset();
        this._reachabilityCheckTimeoutId = setTimeout(
          this._checkReachabilityAndScheduleReconnect.bind(this),
          this._options.reachabilityPollingIntervalMillis);
      };
      xhr.onerror = retryLater;
      xhr.ontimeout = retryLater;
      xhr.send();
    }
  }

  _cancelReachabilityCheck() {
    if (this._reachabilityCheckTimeoutId) {
      clearTimeout(this._reachabilityCheckTimeoutId);
      this._reachabilityCheckTimeoutId = 0;
    }
  }

  _scheduleReconnect() {
    const waitMillis = this._backoff.nextDelay();
    this._retryCount++;
    this._debugLog(`Scheduling websocket reconnect attempt ${this._retryCount} in ${waitMillis}ms`);

    const event = new AttemptReconnectEvent(this._retryCount, waitMillis);
    this.onbeforereconnect(event);
    this._callHandlers("beforereconnect", event);

    this._scheduledReconnectTimeoutId = setTimeout(this._openWebsocket.bind(this), waitMillis);
  }

  _cancelScheduledReconnect() {
    if (this._scheduledReconnectTimeoutId) {
      clearTimeout(this._scheduledReconnectTimeoutId);
      this._scheduledReconnectTimeoutId = 0;
    }
  }

  _scheduleWebsocketConnectionCheck() {
    setTimeout(this._checkWebsocketConnection.bind(this), this._options.connectTimeoutMillis);
  }

  _cancelWebsocketConnectionCheck() {
    if (this._websocketConnectionCheckTimeoutId) {
      clearTimeout(this._websocketConnectionCheckTimeoutId);
      this._websocketConnectionCheckTimeoutId = 0;
    }
  }

  _checkWebsocketConnection() {
    this._debugLog(`Checking websocket connection. ReadyState is ${this._websocket.readyState}`);
    if (this._websocket.readyState === READYSTATE.OPEN) {
      // Start pings
      this._schedulePing();
    } else {
      this._websocket.close(4000, "Unable to establish websocket connection before the configured connectTimeoutMillis");
    }
  }

  _debugLog(message) {
    if (this._options.debug) {
      console.debug(message);
    }
  }

  open() {
    if (this._websocket) {
      throw "Websocket has already been opened"
    }
    this._openWebsocket();
  }

  // Delegated Websocket stuff
  close(code, reason) {
    this._manuallyClosed = true;
    this._cancelScheduledReconnect();
    this._cancelWebsocketConnectionCheck();
    this._cancelReachabilityCheck();
    this._cancelPing();

    if (!this._websocket) {
      throw "Can't close websocket because it was never opened.";
    }

    this._websocket.close(code, reason);
  }

  send(data) {
    if (!this._websocket) {
      throw "Can't send through websocket because it was never opened.";
    }
    this._websocket.send(data);
  }

  addEventListener(event, handler) {
    if (this._handlers.hasOwnProperty(event)) {
      this._handlers[event].push(handler);
    }
  }

  removeEventListener(event, handler) {
    if (!this._handlers[event]) {
      return;
    }

    if (!handler) {
      this._handlers[event] = [];
    } else {
      const handlerIndex = this._handlers[event].indexOf(handler);
      if (handlerIndex > -1) {
        this._handlers[event].splice(handlerIndex, 1);
      }
    }
  }

  get readyState() {
    if (!this._websocket) {
      throw "Can't get websocket readyState because it was never opened.";
    }
    return this._websocket.readyState;
  }

  get url() {
    return this._url;
  }

  get bufferedAmount() {
    if (!this._websocket) {
      throw "Can't get websocket bufferedAmount because it was never opened.";
    }
    return this._websocket.bufferedAmount;
  }

  get extensions() {
    if (!this._websocket) {
      throw "Can't get websocket extensions because it was never opened.";
    }
    return this._websocket.extensions;
  }

  get binaryType() {
    return this._binaryType;
  }

  set binaryType(val) {
    this._binaryType = val;
    if (this._websocket) {
      this._websocket.binaryType = val;
    }
  }

  get retryCount() {
    return this._retryCount;
  }
}
