/**
 * WHAT NEEDS TO BE DONE
 *
 * Reachability
 * Like, all the logic
 */

import Backoff from "./backoff";

const defaultOptions = {
  debug: false,
  initialBackoffDelayMillis: 500,
  maxBackoffDelayMillis: 90000,
  pingSendFunction: null, // Function that takes the PersistentWebsocket instance as its only parameter
  pingIntervalSeconds: 30,
  pingTimeoutMillis: 2000,
  connectTimeoutMillis: 3000,
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

    this._url = url;
    this._protocols = protocols;
    this._options = Object.assign({}, defaultOptions, options);
    this._backoff = new Backoff(this._options.initialBackoffDelayMillis, this._options.maxBackoffDelayMillis);
    this._waitingForPong = false;
    this._manuallyClosed = false;
    this._hasConnected = false;
    this._retryCount = 0;

    this._pingIntervalId = 0;
    this._scheduledReconnectTimeoutId = 0;
    this._websocketConnectionCheckTimeoutId = 0;
  }

  _createWebsocket(url, protocols) {
    return new WebSocket(url, protocols);
  }

  _openWebsocket() {
    this._debugLog("Trying to open websocket");
    const ws = this._createWebsocket(this._url, this._protocols);
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

  _onWebsocketClose(event) {
    event.wasExpected = this._manuallyClosed;
    this.onclose(event);
    if (!this._manuallyClosed) {
      this._scheduleReconnect();
    }
  }

  _onWebsocketError(event) {
    this.onerror(event);
  }

  _onWebsocketMessage(event) {
    this._waitingForPong = false;
    this.onmessage(event);
  }

  _onWebsocketOpen(event) {
    // Start pings
    const {pingSendFunction, pingIntervalSeconds} = this._options;
    if (pingSendFunction && pingIntervalSeconds) {
      this._pingIntervalId = setInterval(this._sendPing, this._options.pingIntervalSeconds, this);
    }

    event.wasReconnect = this._hasConnected;
    this.onopen(event);
    this._hasConnected = true;
    this._retryCount = 0;

    if (event.target.readyState == WebSocket.OPEN) {
      this._cancelWebsocketConnectionCheck();
    }
  }

  _sendPing(self) {
    self._waitingForPong = true;
    self._options.pingSendFunction(self);
    setTimeout(self._checkPingResult, self._options.pingTimeoutMillis, self);
  }

  _checkPingResult(self) {
    if (self._waitingForPong) {
      clearInterval(self._pingIntervalId);
      self._pingIntervalId = 0;
      self._websocket.close(4001, "Closing websocket due to ping failure.");
    }
  }

  _scheduleReconnect() {
    const waitMillis = this._backoff.nextDelay();
    this._retryCount++;
    this._debugLog(`Scheduling websocket reconnect attempt ${this._retryCount} in ${waitMillis}ms`);
    this.onbeforereconnect(new AttemptReconnectEvent(this._retryCount, waitMillis));

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
    if (this._websocket.readyState != WebSocket.OPEN) {
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