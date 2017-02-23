/**
 * Backoff based on "Decorrelated jitter" algorithm on https://www.awsarchitectureblog.com/2015/03/backoff.html
 */

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

export default class Backoff {
  constructor(initialDelayMillis, maxDelayMillis, randomBetweenFunc = randomBetween) {
    this._initialDelay = initialDelayMillis;
    this._maxDelay = maxDelayMillis;
    this._nextDelay = this._initialDelay;
    this._randomBetween = randomBetweenFunc;
  }

  reset() {
    this._nextDelay = this._initialDelay;
  }

  nextDelay() {
    const delay = this._nextDelay;
    this._nextDelay = Math.min(
      this._maxDelay,
      this._randomBetween(this._initialDelay, delay * 3),
    );
    return delay;
  }
}