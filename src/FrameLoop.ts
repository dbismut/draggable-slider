/* eslint-disable @typescript-eslint/no-unsafe-function-type */

import { clamp } from './utils';

const now = () =>
  typeof performance != 'undefined' ? performance.now() : Date.now();

// TODO check if there's a better way to take into account fast refresh rates
const FPS = 100 / 6 / 2;

export class FrameLoop {
  rafId = 0;
  queue = new Set<Function>();
  running = false;
  time = {
    start: 0,
    delta: 0,
    elapsed: 0,
    _elapsed: 0,
  };
  onDemand = false;

  tick() {
    if (!this.running) {
      return;
    }
    this.update();
    this.rafId = window.requestAnimationFrame(this.tick.bind(this));
  }

  update() {
    if (!this.running) {
      return;
    }
    this.updateTime();
    this.queue.forEach((cb) => cb());
  }

  run() {
    if (!this.running) {
      this.time = { start: now(), elapsed: 0, delta: 0, _elapsed: 0 };
      this.running = true;
      if (!this.onDemand) {
        // we need elapsed time to be > 0 on the first frame
        this.rafId = window.requestAnimationFrame(this.tick.bind(this));
      }
    }
  }

  start(cb: Function) {
    this.queue.add(cb);
    this.run();
  }

  stop(cb: Function) {
    if (!cb) {
      return;
    }
    this.queue.delete(cb);
    if (!this.queue.size) {
      this.stopAll();
    }
  }

  stopAll() {
    if (this.rafId) window.cancelAnimationFrame(this.rafId);

    this.running = false;
  }

  updateTime() {
    const ts = now();
    const _elapsed = ts - this.time.start;
    this.time.delta = clamp(_elapsed - this.time._elapsed, FPS, 32);
    this.time._elapsed = _elapsed;
    this.time.elapsed += this.time.delta;
  }
}

export const Loop = new FrameLoop();
