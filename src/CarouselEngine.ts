import { getResizeObserver } from './resizeObserver';
import { findClosestIndex, clamp } from './utils';

import { DragEngine } from './DragEngine';
import { Emitter } from './Emitter';
import { Motion } from './Motion';

import type { State } from './DragEngine';

export type CarouselEngineOptions = {
  index?: number;
  mouseDrag?: boolean;
};

export class CarouselEngine extends Emitter {
  element: HTMLElement | null = null;
  snapPoints: number[] = [];

  #_index = 0;

  #layoutTimeout = 0;
  #scrollThrottle = 0;
  #resizeTimeout = 0;
  #width = 0;
  #maxScroll = 0;
  #touching = false;
  #snap = false;
  #initialized = false;
  #inertia = false;
  #mouseDrag = false;
  #disableUpdate = false;

  #dragger?: DragEngine;
  #motion?: Motion;

  #wheelTimeout = 0;
  #focusTimeout = 0;

  get #length() {
    return this.snapPoints.length;
  }

  get #index() {
    return this.#_index;
  }
  set #index(val) {
    if (val >= 0 && val < this.#length && val !== this.#index) {
      this.#_index = val;
      this.emit('change');
    }
  }

  // used for controlling the carousel from userland
  get index() {
    return this.#index;
  }
  set index(val: number) {
    const prevIndex = this.#index;
    this.#index = val;
    // if the index has changed then we need to sync the scroll to the new index
    if (prevIndex !== this.#index) {
      this.#disableUpdate = true;
      this.#syncScroll();
    }
  }

  get canScrollPrev() {
    return this.index > 0;
  }
  get canScrollNext() {
    return this.index < this.#length - 1;
  }

  init(
    el: HTMLElement,
    { index = 0, mouseDrag = false }: CarouselEngineOptions = {}
  ) {
    this.element = el;

    this.element.addEventListener('touchstart', this.#onTouchStart, {
      passive: true,
    });
    this.element.addEventListener('touchend', this.#onTouchEnd, {
      passive: true,
    });
    this.element.addEventListener('touchcancel', this.#onTouchEnd, {
      passive: true,
    });
    this.element.addEventListener('scroll', this.#onScroll, { passive: true });
    this.element.addEventListener('wheel', this.#onWheel, { passive: true });
    this.#index = index; // we trust the initial index to be within bounds
    this.#mouseDrag = mouseDrag;

    if (this.#mouseDrag) {
      this.#motion = new Motion(el, 'scrollLeft');

      this.#dragger = new DragEngine(this.element, this.#onDrag, () => ({
        beforeStart: () => {
          // we need to stop the motion as soon as the user clicks on the carousel
          // since onDrag has a threshold
          this.#motion!.stop();
          this.#disableUpdate = false;
          this.#scrollThrottle = 0;
          clearTimeout(this.#focusTimeout);
          clearTimeout(this.#wheelTimeout);
        },
        rubber: false,
        touch: false,
        from: { x: -this.element!.scrollLeft },
      }));

      this.#dragger.init();
    }

    const observer = getResizeObserver();
    observer.subscribe(el, this.#onResize);
  }

  #resetSnapStyle = () => {
    if (this.element) {
      this.element.style.scrollSnapType = '';
    }
  };

  #onDrag = async ({ offset, first, last, tap }: State) => {
    const element = this.element!;
    if (tap) {
      return;
    }
    if (first) {
      element.style.scrollSnapType = 'none';
    }
    if (last) {
      this.#inertia = true;

      await this.#motion!.set(-offset.x, {
        inertia: true,
        snapPoints: this.#snap ? this.snapPoints : undefined,
        max: this.#maxScroll,
        min: 0,
      });

      this.#inertia = false;

      this.#resetSnapStyle();
      return;
    }

    this.#motion!.set(-offset.x, {
      immediate: true,
      max: this.#maxScroll,
      min: 0,
    });
  };

  #onTouchStart = () => {
    this.#touching = true;
  };

  #onTouchEnd = () => {
    this.#touching = false;
  };

  #onWheel = () => {
    this.#resetSnapStyle();
    this.#disableUpdate = false;
    clearTimeout(this.#wheelTimeout);
    this.#wheelTimeout = setTimeout(this.#resetSnapStyle, 50);
    if (this.#inertia) {
      this.#inertia = false;
      this.#motion!.stop();
    }
  };

  #syncScroll = (smooth = true) => {
    this.#motion?.stop();
    this.#resetSnapStyle();
    clearTimeout(this.#scrollThrottle);
    if (this.#touching || !this.#initialized) {
      return;
    }

    this.element?.scrollTo({
      left: this.snapPoints[this.index],
      behavior: smooth ? 'smooth' : 'instant',
    });
  };

  #updateIndex = () => {
    if (this.#disableUpdate || !this.element) return;
    this.#index = findClosestIndex(
      this.element.scrollLeft,
      this.snapPoints,
      true
    );
  };

  #focusActive = () => {
    clearTimeout(this.#focusTimeout);
    // `preventScroll` is necessary so that the scroll doesn't jump when the item is focused.
    // This could happen when the user is dragging down the drawer to close it while the timeout is running.
    this.#focusTimeout = setTimeout(
      () =>
        (this.element?.children[this.#index] as HTMLElement)?.focus({
          preventScroll: true,
        }),
      200
    );
  };

  #onScroll = () => {
    // Let's throttle this function to avoid firing it on every frame
    if (!this.element || this.#scrollThrottle) {
      return;
    }

    this.#scrollThrottle = setTimeout(() => (this.#scrollThrottle = 0), 150);
    this.#updateIndex();
    this.#focusActive();
  };

  layout = () => {
    if (this.element) {
      this.#resetSnapStyle();
      this.#maxScroll = this.element.scrollWidth - this.#width;
      const elementStyle = window.getComputedStyle(this.element!);
      this.#snap = elementStyle.scrollSnapType === 'x mandatory';

      const scrollPaddingStart = ~~parseInt(
        elementStyle.scrollPaddingInlineStart
      );
      const scrollPaddingEnd = ~~parseInt(elementStyle.scrollPaddingInlineEnd);

      this.snapPoints = Array.prototype.map.call(
        this.element.children,
        (item) => {
          const itemStyle = getComputedStyle(item);
          const snapAlign = itemStyle.scrollSnapAlign;
          if (snapAlign === 'start') {
            return clamp(
              item.offsetLeft - scrollPaddingStart,
              0,
              this.#maxScroll
            );
          }
          if (snapAlign === 'end') {
            return clamp(
              item.offsetLeft +
                item.offsetWidth -
                this.#width +
                scrollPaddingEnd,
              0,
              this.#maxScroll
            );
          }
          return clamp(
            item.offsetLeft + item.offsetWidth / 2 - this.#width / 2,
            0,
            this.#maxScroll
          );
        }
      ) as number[];

      // when changing items, we want to reselect the id to where it was
      clearTimeout(this.#layoutTimeout);
      this.#layoutTimeout = setTimeout(() => {
        this.#syncScroll(false);
      }, 10);
    }
  };

  #onResize = (entry: ResizeObserverEntry) => {
    clearTimeout(this.#resizeTimeout);

    const resize = () => {
      this.#width = entry.borderBoxSize[0]!.inlineSize as number;
      this.layout();
    };

    if (this.#initialized) {
      this.#resizeTimeout = setTimeout(resize, 75);
    } else {
      resize();
      this.#initialized = true;
      this.emit('ready');
    }
  };

  clean = () => {
    super.clean();
    this.#initialized = false;
    this.#dragger?.clean();
    this.#motion?.clean();
    const observer = getResizeObserver();
    clearTimeout(this.#scrollThrottle);
    clearTimeout(this.#layoutTimeout);
    clearTimeout(this.#resizeTimeout);
    clearTimeout(this.#wheelTimeout);
    clearTimeout(this.#focusTimeout);
    if (this.element) {
      this.#resetSnapStyle();
      observer.unsubscribe(this.element, this.#onResize);
      this.element.removeEventListener('touchstart', this.#onTouchStart);
      this.element.removeEventListener('touchend', this.#onTouchEnd);
      this.element.removeEventListener('touchcancel', this.#onTouchEnd);
      this.element.removeEventListener('scroll', this.#onScroll);
      this.element.removeEventListener('wheel', this.#onWheel);
    }
  };
}
