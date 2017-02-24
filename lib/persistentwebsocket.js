(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define("persistentwebsocket", [], factory);
	else if(typeof exports === 'object')
		exports["persistentwebsocket"] = factory();
	else
		root["persistentwebsocket"] = factory();
})(this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;
/******/
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// identity function for calling harmony imports with the correct context
/******/ 	__webpack_require__.i = function(value) { return value; };
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 16);
/******/ })
/************************************************************************/
/******/ ({

/***/ 1:
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * Backoff based on "Decorrelated jitter" algorithm on https://www.awsarchitectureblog.com/2015/03/backoff.html
 */

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

var Backoff = function () {
  function Backoff(initialDelayMillis, maxDelayMillis) {
    var randomBetweenFunc = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : randomBetween;

    _classCallCheck(this, Backoff);

    this._initialDelay = initialDelayMillis;
    this._maxDelay = maxDelayMillis;
    this._nextDelay = this._initialDelay;
    this._randomBetween = randomBetweenFunc;
  }

  _createClass(Backoff, [{
    key: "reset",
    value: function reset() {
      this._nextDelay = this._initialDelay;
    }
  }, {
    key: "nextDelay",
    value: function nextDelay() {
      var delay = this._nextDelay;
      this._nextDelay = Math.min(this._maxDelay, this._randomBetween(this._initialDelay, delay * 3));
      return delay;
    }
  }]);

  return Backoff;
}();

exports.default = Backoff;
module.exports = exports["default"];

/***/ }),

/***/ 16:
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PersistentWebsocket = exports.AttemptReconnectEvent = exports.READYSTATE = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _backoff = __webpack_require__(1);

var _backoff2 = _interopRequireDefault(_backoff);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var READYSTATE = exports.READYSTATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

var defaultOptions = {
  debug: false,
  initialBackoffDelayMillis: 500,
  maxBackoffDelayMillis: 120000,
  pingSendFunction: null, // Function that takes the PersistentWebsocket instance as its only parameter
  pingIntervalSeconds: 30,
  pingTimeoutMillis: 2000,
  connectTimeoutMillis: 3000,
  reachabilityTestUrl: null
};

function noop() {}

var AttemptReconnectEvent = exports.AttemptReconnectEvent = function AttemptReconnectEvent(attemptNumber, waitMillis) {
  _classCallCheck(this, AttemptReconnectEvent);

  this.attemptNumber = attemptNumber;
  this.waitMillis = waitMillis;
};

var PersistentWebsocket = exports.PersistentWebsocket = function () {
  function PersistentWebsocket(url, protocols) {
    var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    _classCallCheck(this, PersistentWebsocket);

    if ((typeof protocols === "undefined" ? "undefined" : _typeof(protocols)) === "object") {
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
    this._backoff = new _backoff2.default(this._options.initialBackoffDelayMillis, this._options.maxBackoffDelayMillis);
    this._waitingForPong = false;
    this._manuallyClosed = false;
    this._hasConnected = false;
    this._retryCount = 0;

    this._pingTimeoutId = 0;
    this._scheduledReconnectTimeoutId = 0;
    this._websocketConnectionCheckTimeoutId = 0;
    this._reachabilityCheckTimeoutId = 0;
  }

  _createClass(PersistentWebsocket, [{
    key: "_createWebsocket",
    value: function _createWebsocket(url, protocols) {
      return new WebSocket(url, protocols);
    }
  }, {
    key: "_createXhr",
    value: function _createXhr() {
      return new XMLHttpRequest();
    }
  }, {
    key: "_openWebsocket",
    value: function _openWebsocket() {
      this._debugLog("Trying to open websocket");
      var ws = this._createWebsocket(this._url, this._protocols);
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
  }, {
    key: "_onWebsocketClose",
    value: function _onWebsocketClose(event) {
      event.wasExpected = this._manuallyClosed;
      this.onclose(event);
      if (!this._manuallyClosed) {
        this._checkReachabilityAndScheduleReconnect();
      }
    }
  }, {
    key: "_onWebsocketError",
    value: function _onWebsocketError(event) {
      this.onerror(event);
    }
  }, {
    key: "_onWebsocketMessage",
    value: function _onWebsocketMessage(event) {
      // Any message counts as a "pong"
      this._waitingForPong = false;

      // Reschedule ping so pings only occur when the inbound side of the connection is quiet for ${pingIntervalSeconds}
      this._schedulePing();

      this.onmessage(event);
    }
  }, {
    key: "_onWebsocketOpen",
    value: function _onWebsocketOpen(event) {
      event.wasReconnect = this._hasConnected;
      this.onopen(event);
      this._hasConnected = true;
      this._retryCount = 0;

      if (event.target.readyState == READYSTATE.OPEN) {
        // Start pings
        this._schedulePing();
        this._cancelWebsocketConnectionCheck();
      }
    }
  }, {
    key: "_sendPing",
    value: function _sendPing() {
      this._debugLog("Pinging websocket...");
      this._waitingForPong = true;
      this._options.pingSendFunction(this);
      setTimeout(this._checkPingResult.bind(this), this._options.pingTimeoutMillis);
    }
  }, {
    key: "_schedulePing",
    value: function _schedulePing() {
      // Always clear out any existing scheduled pings
      if (this._pingTimeoutId) {
        this._cancelPing();
      }

      var _options = this._options,
          pingSendFunction = _options.pingSendFunction,
          pingIntervalSeconds = _options.pingIntervalSeconds;

      if (pingSendFunction && pingIntervalSeconds) {
        this._pingTimeoutId = setTimeout(this._sendPing.bind(this), pingIntervalSeconds * 1000);
      }
    }
  }, {
    key: "_cancelPing",
    value: function _cancelPing() {
      clearTimeout(this._pingTimeoutId);
      this._pingTimeoutId = 0;
    }
  }, {
    key: "_checkPingResult",
    value: function _checkPingResult() {
      if (this._waitingForPong) {
        this._debugLog("Closing websocket due to ping failure.");
        this._websocket.close(4001, "Closing websocket due to ping failure.");
      }
    }
  }, {
    key: "_checkReachabilityAndScheduleReconnect",
    value: function _checkReachabilityAndScheduleReconnect() {
      var _this = this;

      if (!this._options.reachabilityTestUrl) {
        this._scheduleReconnect();
      } else {
        var xhr = this._createXhr();
        xhr.addEventListener("load", function () {
          _this._reachabilityCheckTimeoutId = 0;
          _this._debugLog("ONLINE: HEAD request to " + _this._options.reachabilityTestUrl + " succeeded.");
          _this._scheduleReconnect();
        });
        xhr.addEventListener("error", function () {
          // Check if online again in 3 seconds
          _this._debugLog("OFFLINE: Unable to reach " + _this._options.reachabilityTestUrl + ".\nTrying again in 3s.");
          _this._backoff.reset();
          _this._reachabilityCheckTimeoutId = setTimeout(_this._checkReachabilityAndScheduleReconnect.bind(_this), 3000);
        });
        xhr.open("HEAD", this._options.reachabilityTestUrl);
        xhr.send();
      }
    }
  }, {
    key: "_cancelReachabilityCheck",
    value: function _cancelReachabilityCheck() {
      if (this._reachabilityCheckTimeoutId) {
        clearTimeout(this._reachabilityCheckTimeoutId);
        this._reachabilityCheckTimeoutId = 0;
      }
    }
  }, {
    key: "_scheduleReconnect",
    value: function _scheduleReconnect() {
      var waitMillis = this._backoff.nextDelay();
      this._retryCount++;
      this._debugLog("Scheduling websocket reconnect attempt " + this._retryCount + " in " + waitMillis + "ms");
      this.onbeforereconnect(new AttemptReconnectEvent(this._retryCount, waitMillis));

      this._scheduledReconnectTimeoutId = setTimeout(this._openWebsocket.bind(this), waitMillis);
    }
  }, {
    key: "_cancelScheduledReconnect",
    value: function _cancelScheduledReconnect() {
      if (this._scheduledReconnectTimeoutId) {
        clearTimeout(this._scheduledReconnectTimeoutId);
        this._scheduledReconnectTimeoutId = 0;
      }
    }
  }, {
    key: "_scheduleWebsocketConnectionCheck",
    value: function _scheduleWebsocketConnectionCheck() {
      setTimeout(this._checkWebsocketConnection.bind(this), this._options.connectTimeoutMillis);
    }
  }, {
    key: "_cancelWebsocketConnectionCheck",
    value: function _cancelWebsocketConnectionCheck() {
      if (this._websocketConnectionCheckTimeoutId) {
        clearTimeout(this._websocketConnectionCheckTimeoutId);
        this._websocketConnectionCheckTimeoutId = 0;
      }
    }
  }, {
    key: "_checkWebsocketConnection",
    value: function _checkWebsocketConnection() {
      this._debugLog("Checking websocket connection. ReadyState is " + this._websocket.readyState);
      if (this._websocket.readyState === READYSTATE.OPEN) {
        // Start pings
        this._schedulePing();
      } else {
        this._websocket.close(4000, "Unable to establish websocket connection before the configured connectTimeoutMillis");
      }
    }
  }, {
    key: "_debugLog",
    value: function _debugLog(message) {
      if (this._options.debug) {
        console.debug(message);
      }
    }
  }, {
    key: "open",
    value: function open() {
      if (this._websocket) {
        throw "Websocket has already been opened";
      }
      this._openWebsocket();
    }

    // Delegated Websocket stuff

  }, {
    key: "close",
    value: function close(code, reason) {
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
  }, {
    key: "send",
    value: function send(data) {
      if (!this._websocket) {
        throw "Can't send through websocket because it was never opened.";
      }
      this._websocket.send(data);
    }
  }, {
    key: "readyState",
    get: function get() {
      if (!this._websocket) {
        throw "Can't get websocket readyState because it was never opened.";
      }
      return this._websocket.readyState;
    }
  }, {
    key: "url",
    get: function get() {
      return this._url;
    }
  }, {
    key: "bufferedAmount",
    get: function get() {
      if (!this._websocket) {
        throw "Can't get websocket bufferedAmount because it was never opened.";
      }
      return this._websocket.bufferedAmount;
    }
  }, {
    key: "extensions",
    get: function get() {
      if (!this._websocket) {
        throw "Can't get websocket extensions because it was never opened.";
      }
      return this._websocket.extensions;
    }
  }, {
    key: "binaryType",
    get: function get() {
      return this._binaryType;
    },
    set: function set(val) {
      this._binaryType = val;
      if (this._websocket) {
        this._websocket.binaryType = val;
      }
    }
  }, {
    key: "retryCount",
    get: function get() {
      return this._retryCount;
    }
  }]);

  return PersistentWebsocket;
}();

/***/ })

/******/ });
});
//# sourceMappingURL=persistentwebsocket.js.map