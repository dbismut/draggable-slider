import { Loop } from './FrameLoop';
import { lerp as lerpFn, findClosestIndex, clamp } from './utils';

import { Emitter } from './Emitter';

const defaultConfig = {
  immediate: false,
  sync: false,
  inertia: false,
  easing: 'spring',
  min: -Infinity,
  max: Infinity,
};

type Easing = 'spring' | 'lerp';

type Config<A extends Easing> = {
  easing: A;
  immediate: boolean;
  sync: boolean;
  inertia: boolean;
  min: number;
  max: number;
  snapPoints?: number[];
  distancePrecision: number;
  velocityPrecision: number;
};

const immediate = (motion: Motion) => () => {
  motion.idle = true;
  return motion.to;
};

type SpringConfig = {
  tension?: number;
  friction?: number;
  mass?: number;
  velocity?: number;
};

const spring = (
  motion: Motion,
  { tension: k = 170, friction: c = 26, mass: m = 1, velocity: v }: SpringConfig
) => {
  const zeta = c / (2 * Math.sqrt(k * m));
  const w0 = Math.sqrt(k / m) * 0.001;
  const w1 = w0 * Math.sqrt(1.0 - zeta * zeta);
  const v0 = v ?? motion.startVelocity;

  return function update() {
    const t = motion.elapsed;

    let value;

    if (zeta < 1) {
      const envelope = Math.exp(-zeta * w0 * t);
      value =
        motion.to -
        envelope *
          (((-v0 + zeta * w0 * motion.x0) / w1) * Math.sin(w1 * t) +
            motion.x0 * Math.cos(w1 * t));
    } else {
      const envelope = Math.exp(-w0 * t);
      value = motion.to - envelope * (motion.x0 + (-v0 + w0 * motion.x0) * t);
    }
    return value;
  };
};

type LerpConfig = { factor?: number };

const lerp = (motion: Motion, { factor = 0.05 }: LerpConfig) =>
  function update() {
    return lerpFn(motion.value, motion.to, factor);
  };

type DampingConfig = {
  momentum?: number;
  snapPoints?: number[];
  velocity?: number;
  min?: number;
  max?: number;
};

const damping = (
  motion: Motion,
  {
    momentum = 0.998,
    snapPoints,
    velocity: v,
    min = -Infinity,
    max = Infinity,
  }: DampingConfig
) => {
  const v0 = v ?? motion.startVelocity;

  const update = (t = motion.elapsed) => {
    const e = Math.exp(-(1 - momentum) * t);
    const v = motion.from + (v0 / (1 - momentum)) * (1 - e);
    return clamp(v, min, max);
  };

  const timeToIdle = (-1 / (1 - momentum)) * Math.log(0.02);
  motion.to = update(timeToIdle);
  motion.x0 = motion.to - motion.from;

  const offLimit = motion.to >= max || motion.to <= min;

  // when we have snapPoints provided or we're going off limit, we want
  // the inertia to feel like a smooth motion to its target destination
  if (snapPoints || offLimit) {
    if (snapPoints) {
      const targetIndex = findClosestIndex(motion.to, snapPoints, true);
      motion.to = snapPoints[targetIndex];
    }
    motion.x0 = motion.to - motion.from;
    motion.inertia = false;
    return easings.spring(motion, {
      tension: 28,
      friction: 30,
      velocity: motion.velocity,
    });
  }

  return update;
};

const easings = { immediate, spring, lerp, damping };

type EasingConfigs = {
  spring: SpringConfig;
  lerp: LerpConfig;
};

// This helper type infers the correct configuration based on the easing
type InferConfig<T extends { easing: keyof EasingConfigs }> =
  T['easing'] extends infer A
    ? A extends keyof EasingConfigs
      ? Config<A> & EasingConfigs[A] & DampingConfig
      : never
    : never;

export class Motion extends Emitter {
  #val: any;
  key?: string;

  constructor(valOrObject?: any, key?: string) {
    super();
    if (valOrObject) {
      this.init(valOrObject, key);
    }
  }

  get value() {
    return (this.key ? this.#val[this.key] : this.#val) as number;
  }
  set value(v) {
    if (v === this.value) return;
    this.emit('change', v);
    if (this.key) this.#val[this.key] = v;
    else (this.#val as number) = v;
  }

  init = (valOrObject: any, key?: string) => {
    this.#val = typeof valOrObject === 'function' ? valOrObject() : valOrObject;
    this.key = key;
  };

  startVelocity = 0;
  elapsed = 0;
  from = 0;
  to = 0;
  x0 = 0; // distance
  idle = true;
  inertia = false;
  velocity = 0;
  #easing: Easing = 'spring';

  // keep tracks of the timeout that reset velocity to 0 after some idle time
  #idleTimeout = 0;

  update: () => void = () => void 0;

  stop = () => {
    Loop.stop(this.update);
    this.emit('stop');
  };

  set = <T extends { easing: keyof EasingConfigs }>(
    _to: number,
    inputConfig?: Partial<InferConfig<T>>
  ) => {
    const config = { ...defaultConfig, ...inputConfig } as Config<Easing> &
      EasingConfigs[Easing];

    this.from = this.value;
    this.to = clamp(_to, config.min, config.max);
    this.x0 = this.to - this.from;
    this.elapsed = 0;
    this.startVelocity = this.velocity;
    this.inertia = config.inertia;
    this.#easing = config.easing;

    config.distancePrecision ??= config.snapPoints
      ? 0.5
      : this.#easing === 'spring'
      ? 0.01
      : 0.1;
    config.velocityPrecision ??= config.snapPoints
      ? 0.2
      : this.#easing === 'spring'
      ? 0.001
      : 0.01;

    // if sync is true, we don't animate, we just set the value synchronously
    if (config.sync) {
      this.value = this.to;
      return;
    }

    let resolver: (value: unknown) => void;
    const promise = new Promise((r) => (resolver = r));

    if (this.to === this.value && !config.inertia) {
      this.idle = true;
      this.velocity = 0;
      return;
    }

    this.idle = false;

    const movement = config.immediate
      ? easings.immediate(this)
      : this.inertia
      ? easings.damping(this, config)
      : easings[this.#easing](this, config);

    this.stop();

    this.update = () => {
      if (this.idle) {
        this.stop();
        resolver(void 0);
        // setting velocity to 0 after 50ms of idle
        this.#idleTimeout = window.setTimeout(() => (this.velocity = 0), 50);
        return;
      }

      const delta = Loop.time.delta;
      this.elapsed += delta;

      const unclampedValue = movement();
      const value = clamp(unclampedValue, config.min, config.max);

      this.velocity = (value - this.value) / delta;

      if (
        (this.inertia && Math.abs(this.velocity) < config.velocityPrecision) ||
        (Math.abs(this.to - value) < config.distancePrecision &&
          Math.abs(this.velocity) < config.velocityPrecision)
      ) {
        if (!this.inertia) {
          this.value = this.to;
        }
        this.idle = true;
        return;
      }
      this.value = value;
    };

    // clearing velocity timeout
    clearTimeout(this.#idleTimeout);
    Loop.start(this.update);
    this.emit('start');
    return promise;
  };

  clean = () => {
    super.clean();
    this.stop();
  };
}
