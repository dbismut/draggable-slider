import { clamp, vectorLength, rubberbandIfOutOfBounds } from './utils';

const noop = () => {
  /* */
};

export type State = {
  /**
   * The current event.
   */
  event: MouseEvent | TouchEvent;
  /**
   * The event target.
   */
  target: EventTarget;
  /**
   * The event currentTarget.
   */
  currentTarget: HTMLElement;
  /**
   * Whether the drag is active. This is true when the drag starts and false when
   * the pointer is released.
   */
  active: boolean;
  /**
   * Whether this is the first drag event.
   */
  first: boolean;
  /**
   * Whether this is the last drag event ('mouseup', 'touchend').
   */
  last: boolean;
  /**
   * The drag offset value. Persistent across drags.
   */
  offset: { x: number; y: number };
  /**
   * The delta between current and previous offsets.
   */
  delta: { x: number; y: number };
  /**
   * The distance moved in the _current_ drag.
   */
  movement: { x: number; y: number };
  /**
   * The direction the drag is moving.
   */
  direction: { x: number; y: number };
  /**
   * Current position of the pointer.
   */
  pointer: { x: number; y: number };
  /**
   * The velocity of the drag.
   */
  velocity: { x: number; y: number };
  /**
   * The axis the drag is happening in the first place.
   */
  axis: 'x' | 'y';
  /**
   * Whether the drag was in fact a tap. Useful to detect user click intents.
   */
  tap: boolean;
  /**
   * Whether the drag was canceled.
   */
  canceled: boolean;
  /**
   * Cancels the drag.
   */
  cancel(): void;
};

export type Config = {
  /**
   * Whether the drag should be triggered by MouseEvents. Defaults to true.
   */
  mouse: boolean;
  /**
   * Whether the drag should be triggered by TouchEvents. Defaults to true.
   */
  touch: boolean;
  /**
   * The minimum x value the drag can be at. Defaults to -Infinity. When the
   * x value is below this, the offset will stop decrementing.
   */
  minX: number;
  /**
   * The minimum y value the drag can be at. Defaults to -Infinity. When the
   * y value is below this, the offset will stop decrementing.
   */
  minY: number;
  /**
   * The maximum x value the drag can be at. Defaults to Infinity. When the
   * x value is above this, the offset will stop incrementing.
   */
  maxX: number;
  /**
   * The maximum y value the drag can be at. Defaults to Infinity. When the
   * y value is above this, the offset will stop incrementing.
   */
  maxY: number;
  /**
   * Whether the events attached to the drag should be passive. Defaults to true.
   */
  passive: boolean;
  /**
   * Whether all events should be prevented. (preventDefault() will fire for all
   * events). Note that this forces passive to be false. Defaults to true.
   */
  preventDefault: boolean;
  /**
   * Whether the drag should rubberband back into bounds (set by min, max
   * attributes). Defaults to true.
   */
  rubber: boolean;
  /**
   * The coordinates the offset should start from. This is useful is the position
   * off the dragged object is modified outside from the handler.
   */
  from?: { x?: number; y?: number };
  /**
   * The axis the drag should be restricted to. If set to "x", the drag will be
   * canceled if the initial movement starts on the "y" axis.
   */
  axis?: 'x' | 'y';
  /**
   * Sets pointer events none & cursor grabbing on body
   */
  cancelPointerEvents: boolean;
  /**
   * Called as soon as the user presses the pointer
   */
  beforeStart?: (state: State) => void;
  /**
   * Called as soon as the drag ends
   */
  afterEnd?: (state: State) => void;
};

export type ConfigOrFnConfig = Partial<Config> | (() => Partial<Config>);

export type Handler = (state: State) => void;

const defaultConfig: Config = {
  mouse: true,
  touch: true,
  minX: Number.NEGATIVE_INFINITY,
  minY: Number.NEGATIVE_INFINITY,
  maxX: Number.POSITIVE_INFINITY,
  maxY: Number.POSITIVE_INFINITY,
  passive: true,
  rubber: true,
  preventDefault: false,
  cancelPointerEvents: true,
};

const computeConfig = (config?: ConfigOrFnConfig) => {
  const c = {
    ...defaultConfig,
    ...(typeof config === 'function' ? config() : config),
  };
  if (c.preventDefault) {
    c.passive = false;
  }
  return c;
};

const getXY = (e: Event) =>
  'TouchEvent' in window && e instanceof TouchEvent
    ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
    : { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };

export class DragEngine {
  state: State = {
    // @ts-expect-error will be filled in userland
    event: null,
    // @ts-expect-error will be filled in userland
    target: null,
    // @ts-expect-error will be filled in userland
    currentTarget: null,
    active: false,
    first: false,
    last: false,
    delta: { x: 0, y: 0 },
    direction: { x: 0, y: 0 },
    pointer: { x: 0, y: 0 },
    movement: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    tap: true,
    canceled: false,
    cancel: noop,
  };

  #active = false;
  #config: Config = defaultConfig;
  #initialized = false;

  config?: ConfigOrFnConfig;
  element?: EventTarget;
  handler: Handler;

  constructor(
    element?: EventTarget,
    handler?: Handler,
    config?: ConfigOrFnConfig
  ) {
    this.element = element;
    this.handler = handler || noop;
    this.config = config;
  }

  drag = (eventDown: Event) => {
    // Prevent dual MouseEvent & TouchEvent
    if (this.#active) {
      return;
    }
    this.#active = true;

    this.#config.beforeStart?.(this.state);
    this.#config = computeConfig(this.config);

    const state = this.state;
    const config = this.#config;

    if (config.preventDefault) {
      eventDown.preventDefault();
    }

    state.target = eventDown.target!;
    state.currentTarget = eventDown.currentTarget! as HTMLElement;
    state.active = false;
    state.tap = true;
    const start = getXY(eventDown);
    const movement = { x: 0, y: 0 };
    const prevOffset = { x: 0, y: 0 };
    let pointer = start;
    let timeStamp: number;
    let dt;

    if (config.from?.x !== undefined) {
      state.offset.x = config.from.x;
    }
    if (config.from?.y !== undefined) {
      state.offset.y = config.from.y;
    }

    state.currentTarget.style.userSelect = 'none';
    state.currentTarget.style.webkitUserSelect = 'none';

    const move = (eventMove: Event) => {
      const previousPointer = pointer;
      pointer = getXY(eventMove);
      state.direction.x = Math.sign(pointer.x - previousPointer.x);
      state.direction.y = Math.sign(pointer.y - previousPointer.y);

      if (state.active) {
        state.event = eventMove as MouseEvent | TouchEvent;
        state.first = false;
        state.pointer = pointer;

        movement.x = state.pointer.x - start.x;
        movement.y = state.pointer.y - start.y;

        const previousOffset = { ...state.offset };

        state.offset.x = config.rubber
          ? rubberbandIfOutOfBounds(
              prevOffset.x + movement.x,
              config.minX,
              config.maxX
            )
          : clamp(prevOffset.x + movement.x, config.minX, config.maxX);
        state.offset.y = config.rubber
          ? rubberbandIfOutOfBounds(
              prevOffset.y + movement.y,
              config.minY,
              config.maxY
            )
          : clamp(prevOffset.y + movement.y, config.minY, config.maxY);

        dt = eventMove.timeStamp - timeStamp;

        state.velocity.x = state.delta.x / dt;
        state.velocity.y = state.delta.y / dt;
        state.delta.x = state.offset.x - previousOffset.x;
        state.delta.y = state.offset.y - previousOffset.y;
        state.movement.x += state.delta.x;
        state.movement.y += state.delta.y;

        timeStamp = eventMove.timeStamp;

        this.handler(state);
      } else {
        const mx = Math.abs(pointer.x - start.x);
        const my = Math.abs(pointer.y - start.y);
        if (config.axis === 'x' && mx < my) {
          end();
          return;
        }
        if (config.axis === 'y' && my < mx) {
          end();
          return;
        }
        const length = vectorLength(mx, my);
        if (length > 3) {
          activate(eventMove);
        }
      }
    };

    const activate = (eventActivate: Event) => {
      state.event = eventActivate as MouseEvent | TouchEvent;
      state.active = true;
      state.tap = false;
      state.first = true;
      state.last = false;
      state.canceled = false;
      state.delta = { x: 0, y: 0 };
      state.velocity = { x: 0, y: 0 };
      state.pointer = getXY(eventActivate);
      state.movement = { x: 0, y: 0 };

      prevOffset.x = state.offset.x;
      prevOffset.y = state.offset.y;
      timeStamp = eventActivate.timeStamp;

      this.handler(state);
    };

    const end = () => {
      this.#active = false;
      const wasActive = state.active;
      state.last = wasActive;
      state.active = false;

      // clamp to rubberBounds
      state.offset.x = clamp(state.offset.x, config.minX, config.maxX);
      state.offset.y = clamp(state.offset.y, config.minY, config.maxY);

      state.currentTarget.style.userSelect = '';
      state.currentTarget.style.webkitUserSelect = '';

      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      if (wasActive || state.tap) {
        this.handler(state);
      }
      config.afterEnd?.(state);
    };

    if (eventDown instanceof MouseEvent) {
      window.addEventListener('mousemove', move, { passive: false });
      window.addEventListener('mouseup', end, { passive: false });
    } else {
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', end, { passive: false });
      window.addEventListener('touchcancel', end, { passive: false });
    }

    state.cancel = () => {
      if (state.canceled) {
        return;
      }
      this.#active = false;
      state.canceled = true;
      setTimeout(() => end(), 0);
    };
  };

  click = (e: Event) => {
    // @ts-expect-error simplify listener types
    if (!this.state.tap && e.detail > 0) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  clean = () => {
    if (!this.#initialized) {
      return;
    }
    if (this.#config.touch) {
      this.element?.removeEventListener('touchstart', this.drag);
    }
    if (this.#config.mouse) {
      this.element?.removeEventListener('mousedown', this.drag);
    }

    this.element?.removeEventListener('click', this.click, true);
    this.#initialized = false;
  };

  init = () => {
    if (this.#initialized) {
      return;
    }

    this.#config = computeConfig(this.config);

    if (this.#config.touch) {
      this.element?.addEventListener('touchstart', this.drag, {
        passive: this.#config.passive,
      });
    }
    if (this.#config.mouse) {
      this.element?.addEventListener('mousedown', this.drag, {
        passive: this.#config.passive,
      });
    }

    this.element?.addEventListener('click', this.click, true);
    this.#initialized = true;
  };
}
