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
      const [method, argJsonString, timeout] = actionString.split("|");
      const arg = JSON.parse(argJsonString);
      const self = this;
      setTimeout(() => {
        self[method](arg)
      }, parseInt(timeout));
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
  });

  beforeEach(function () {
    clock = sinon.useFakeTimers();
    xhr = sinon.useFakeXMLHttpRequest();
    xhrRequests = [];
    xhr.onCreate = (r) => xhrRequests.push(r);
  });

  afterEach(function () {
    clock.restore();
    xhr.restore();
  });

  it('waits to be opened', function () {
    const pws = new PersistentWebsocket(`setReadyState|${READYSTATE.OPEN}|0`);
    expect(fakeWebsocket).to.be.undefined;

    pws.open();
    clock.tick(1);
    expect(fakeWebsocket.readyState).to.equal(READYSTATE.OPEN);
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
    fakeWebsocket.onmessage({whatever: "junk"});
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

  it('automatically reconnects', function () {
    const wsActions = [
      `setReadyState|${READYSTATE.OPEN}|200`,
      `close|0|1000`,
    ];
    const pws = new PersistentWebsocket(wsActions.join(','), {initialBackoffDelayMillis: 1});
    pws.open();
    clock.tick(900);
    const firstWs = fakeWebsocket;
    expect(fakeWebsocket.readyState).to.equal(READYSTATE.OPEN);
    clock.tick(100);
    expect(fakeWebsocket.readyState).to.equal(READYSTATE.CLOSED);
    clock.tick(500);
    expect(fakeWebsocket.readyState).to.equal(READYSTATE.OPEN);

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
    expect(fakeWebsocket.readyState).to.equal(READYSTATE.OPEN);
    clock.tick(1000);
    expect(pingCalled).to.be.true;
    clock.tick(500);
    expect(fakeWebsocket.readyState).to.equal(READYSTATE.CLOSED);
    clock.tick(1100);
    expect(fakeWebsocket.readyState).to.equal(READYSTATE.OPEN);
  });
});
