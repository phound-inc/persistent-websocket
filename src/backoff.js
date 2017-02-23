/**
 * Backoff based on "Decorrelated jitter" algorithm on https://www.awsarchitectureblog.com/2015/03/backoff.html
 */

function randomBetween(min, max)  {
  return Math.floor(Math.random() * (max - min)) + min
}

export default class Backoff {
  constructor(initialDelayMillis, maxDelayMillis, randomBetweenFunc=randomBetween) {
    this._initialDelay = initialDelayMillis;
    this._maxDelay = maxDelayMillis;
    this._lastDelay = -1;
    this._randomBetween = randomBetweenFunc;
  }

  reset() {
    this._lastDelay = -1;
  }

  nextDelay() {
    if (this._lastDelay < 0) {
      this._lastDelay = this._initialDelay;
    } else {
      this._lastDelay = Math.min(
        this._maxDelay,
        this._randomBetween(this._initialDelay, this._lastDelay*3),
      );
    }
    return this._lastDelay;
  }
}