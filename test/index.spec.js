/*global describe, it, before, after */
import chai from 'chai';
import sinon from 'sinon';
import {PersistentWebsocket, READYSTATE} from '../src/index';

chai.expect();

const expect = chai.expect;


/**
 * Utility class so we're not dealing with real websockets
 * You can pass magic strings into the url to make it do tricks
 * Magic strings are comma-delimited actions in the format: {method}|{arg_as_json}|{timeout}
 *
 * e.g. 'setReadyState|1|100,onerror|{"name":"error"}|105'
 */
class FakeWebSocket {
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = READYSTATE.CONNECTING;

    this.url.split(",").forEach((actionString) => {
      if (actionString) {
        const [method, argJsonString, timeout] = actionString.split("|");
        const arg = JSON.parse(argJsonString);
        const self = this;
        setTimeout(() => {
          self[method](arg)
        }, parseInt(timeout));
      }
    });
  }

  setReadyState(val) {
    this.readyState = val;
    if (val === READYSTATE.OPEN && this.onopen) {
      this.onopen({name: "open", target: this});
    } else if (val === READYSTATE.CLOSED && this.onclose) {
      this.onclose({name: "closed", target: this});
    }
  }

  close(code, reason) {
    this.setReadyState(READYSTATE.CLOSED);
  }
}

describe('PersistentWebsocket', function () {
  let fakeWebsocket, xhr, xhrRequests, clock;

  before(function () {
    PersistentWebsocket.prototype._createWebsocket = (url, protocols) => {
      fakeWebsocket = new FakeWebSocket(url, protocols);
      return fakeWebsocket;
    };
    xhr = global.XMLHttpRequest = sinon.useFakeXMLHttpRequest();
    xhr.onCreate = (r) => xhrRequests.push(r);
  });

  beforeEach(function () {
    clock = sinon.useFakeTimers();
    xhrRequests = [];
  });

  afterEach(function () {
    clock.restore();
  });

  it('waits to be opened', function () {
    const pws = new PersistentWebsocket(`setReadyState|${READYSTATE.OPEN}|0`);
    expect(pws._websocket).to.be.undefined;

    pws.open();
    clock.tick(1);
    expect(pws._websocket.readyState).to.equal(READYSTATE.OPEN);
  });

  it('pings when the connection is quiet', function () {
    let pingCalled = false;
    const pws = new PersistentWebsocket(`setReadyState|${READYSTATE.OPEN}|0`, {
      pingSendFunction: (ws) => {
        pingCalled = true;
      },
      pingIntervalSeconds: 1
    });
    pws.open();
    expect(pingCalled).to.be.false;
    clock.tick(750);
    pws._websocket.onmessage({whatever: "junk"});
    clock.tick(750);
    // Prior message should have reset the ping interval timer
    expect(pingCalled).to.be.false;
    clock.tick(300);
    expect(pingCalled).to.be.true;
  });

  it('skips pings when not configured', function () {
    const pws = new PersistentWebsocket(`setReadyState|${READYSTATE.OPEN}|0`, {pingIntervalSeconds: 1});
    pws.open();
    clock.tick(60000); // Just make sure nothing explodes when the ping interval passes
  });

  it('respects ping configuration values', function () {
    let pingCalled = false;
    let pws = new PersistentWebsocket(`setReadyState|${READYSTATE.OPEN}|0`, {
      pingSendFunction: (ws) => {
        pingCalled = true;
      },
      pingIntervalSeconds: 1
    });
    pws.open();
    expect(pingCalled).to.be.false;
    clock.tick(1100);
    expect(pingCalled).to.be.true;

    pingCalled = false;
    pws = new PersistentWebsocket(`setReadyState|${READYSTATE.OPEN}|0`, {
      pingSendFunction: (ws) => {
        pingCalled = true;
      },
      pingIntervalSeconds: 2
    });
    pws.open();
    clock.tick(1100);
    expect(pingCalled).to.be.false;
    clock.tick(1000);
    expect(pingCalled).to.be.true;

    pingCalled = false;
    pws = new PersistentWebsocket(`setReadyState|${READYSTATE.OPEN}|0`, {
      pingSendFunction: () => {
        pingCalled = true;
      },
      pingIntervalSeconds: 1,
      pingTimeoutMillis: 100,
      initialBackoffDelayMillis: 500,
    });
    pws.onclose = sinon.spy();
    pws.open();
    clock.tick(1001);
    expect(pingCalled).to.be.true;
    expect(pws._websocket.readyState).to.equal(READYSTATE.OPEN);
    clock.tick(100);
    expect(pws._websocket.readyState).to.equal(READYSTATE.CLOSED);
    sinon.assert.called(pws.onclose);
  });

  it('automatically reconnects', function () {
    const wsActions = [
      `setReadyState|${READYSTATE.OPEN}|200`,
      `close|0|1000`,
    ];
    const pws = new PersistentWebsocket(wsActions.join(','), {initialBackoffDelayMillis: 1});
    pws.open();
    clock.tick(900);
    const firstWs = fakeWebsocket;
    expect(pws._websocket.readyState).to.equal(READYSTATE.OPEN);
    clock.tick(100);
    expect(pws._websocket.readyState).to.equal(READYSTATE.CLOSED);
    clock.tick(500);
    expect(pws._websocket.readyState).to.equal(READYSTATE.OPEN);

    // Make sure it's a new websocket
    const secondWs = fakeWebsocket;
    expect(firstWs).not.to.equal(secondWs);
  });

  it('closes and automatically reconnects on ping failure', function () {
    const wsActions = [
      `setReadyState|${READYSTATE.OPEN}|1`,
    ];
    let pingCalled = false;
    const pws = new PersistentWebsocket(wsActions.join(','), {
      pingSendFunction: (ws) => {
        pingCalled = true;
      },
      pingIntervalSeconds: 1,
      pingTimeoutMillis: 500,
      initialBackoffDelayMillis: 1000,
    });
    pws.open();
    clock.tick(100);
    expect(pws._websocket.readyState).to.equal(READYSTATE.OPEN);
    clock.tick(1000);
    expect(pingCalled).to.be.true;
    clock.tick(500);
    expect(pws._websocket.readyState).to.equal(READYSTATE.CLOSED);
    clock.tick(1100);
    expect(pws._websocket.readyState).to.equal(READYSTATE.OPEN);
  });

  it('doesn\'t reconnect after manual closing', function () {
    const wsActions = [
      `setReadyState|${READYSTATE.OPEN}|1`,
    ];
    const pws = new PersistentWebsocket(wsActions.join(','));
    pws.open();
    clock.tick(500);
    pws.close();
    clock.tick(60000);
    expect(pws._websocket.readyState).to.equal(READYSTATE.CLOSED);
  });

  it('times out if it takes to long to establish connection', function () {
    const wsActions = [
      `setReadyState|${READYSTATE.OPEN}|10000`,
    ];
    const pws = new PersistentWebsocket(wsActions.join(','), {
      connectTimeoutMillis: 100,
    });
    pws.onclose = sinon.spy();
    pws.open();
    clock.tick(500);
    expect(pws._websocket.readyState).to.equal(READYSTATE.CLOSED);
    sinon.assert.called(pws.onclose);
  });

  it('adds wasExpected field on close events', function () {
    const closeEvents = [];
    const wsActions = [
      `setReadyState|${READYSTATE.OPEN}|1`,
      `setReadyState|${READYSTATE.CLOSED}|1000`,
    ];
    const pws = new PersistentWebsocket(wsActions.join(','));
    pws.onclose = (e) => closeEvents.push(e);
    pws.open();
    clock.tick(1500);
    expect(closeEvents.pop().wasExpected).to.be.false;
    pws.close();
    clock.tick(1000);
    expect(closeEvents.pop().wasExpected).to.be.true;
  });

  it('adds wasReconnect field on open events', function () {
    const openEvents = [];
    const wsActions = [
      `setReadyState|${READYSTATE.OPEN}|1`,
      `setReadyState|${READYSTATE.CLOSED}|1000`,
    ];
    const pws = new PersistentWebsocket(wsActions.join(','), {initialBackoffDelayMillis: 1});
    pws.onopen = (e) => openEvents.push(e);
    pws.open();
    clock.tick(500);
    expect(openEvents.pop().wasReconnect).to.be.false;
    clock.tick(1000);
    expect(openEvents.pop().wasReconnect).to.be.true;
  });

  it('checks reachability endpoint before reconnecting', function () {
    const wsActions = [
      `setReadyState|${READYSTATE.OPEN}|100`,
      `setReadyState|${READYSTATE.CLOSED}|1000`,
    ];
    const pws = new PersistentWebsocket(wsActions.join(','), {
      initialBackoffDelayMillis: 1,
      reachabilityTestUrl: '/favicon.ico',
      reachabilityTestTimeoutMillis: 1000,
      reachabilityPollingIntervalMillis: 2000,
    });
    pws.open();
    clock.tick(1200);
    expect(xhrRequests.length).to.equal(1);
    expect(xhrRequests[0].url).to.equal('/favicon.ico');
    clock.tick(1000);
    // Xhr request should have timed out
    expect(pws._websocket.readyState).to.equal(READYSTATE.CLOSED);
    clock.tick(2000);
    // Should have another reachability request
    expect(xhrRequests.length).to.equal(2);
    expect(xhrRequests[1].url).to.equal('/favicon.ico');
    xhrRequests[1].respond(200);
    clock.tick(200);
    // Should have reconnected after a successful reachability check
    expect(pws._websocket.readyState).to.equal(READYSTATE.OPEN);
  });

  it('resets backoff after a reachability failure', function () {
    const pws = new PersistentWebsocket('', {
      connectTimeoutMillis: 100,
      initialBackoffDelayMillis: 100,
      maxBackoffDelayMillis: 101,
      reachabilityTestUrl: '/favicon.ico',
      reachabilityTestTimeoutMillis: 100,
      reachabilityPollingIntervalMillis: 100,
    });
    pws._backoff.reset = sinon.spy(pws._backoff.reset);
    pws.open();
    clock.tick(101); // Connect should have timed out, and reachability xhr issued
    xhrRequests.pop().respond(200); // Successful reachability test
    clock.tick(100); // Tick past initial backoff
    clock.tick(100); // Tick past connection timeout
    sinon.assert.notCalled(pws._backoff.reset);

    xhrRequests.pop().ontimeout(); // Force a reachability timeout

    sinon.assert.called(pws._backoff.reset);
  });

  it('remembers binaryType setting between reconnects', function () {
      const wsActions = [
      `setReadyState|${READYSTATE.OPEN}|100`,
      `setReadyState|${READYSTATE.CLOSED}|1000`,
    ];
    const pws = new PersistentWebsocket(wsActions.join(','), {
      initialBackoffDelayMillis: 1,
    });
    pws.open();
    pws.binaryType = "test";
    clock.tick(1500);
    expect(pws._websocket.binaryType).to.equal("test");
  });
});
