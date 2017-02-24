/*global describe, it, before */

import chai from 'chai';
import Backoff from '../src/backoff.js';

chai.expect();

const expect = chai.expect;

describe('Backoff', function () {
  it('starts with initial delay', function () {
    const backoff = new Backoff(100, 200);
    expect(backoff.nextDelay()).to.be.equal(100);
  });

  it('changes delay with each invocation, up to max', function () {
    let nextInt = 0;
    const backoff = new Backoff(100, 102, (min, max) => {
      nextInt++;
      return min + nextInt;
    });
    expect(backoff.nextDelay()).to.be.equal(100);
    expect(backoff.nextDelay()).to.be.equal(101);
    expect(backoff.nextDelay()).to.be.equal(102);
    expect(backoff.nextDelay()).to.be.equal(102);
  });

  it('can be reset', function () {
    const backoff = new Backoff(100, 200);
    backoff.nextDelay();
    backoff.nextDelay();
    backoff.reset();
    expect(backoff.nextDelay()).to.be.equal(100);
  });
});
