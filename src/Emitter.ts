export class Emitter {
  #listeners = new Map<string, Set<(...a: any[]) => void>>();
  on = (event: string, cb: (...a: any[]) => void) => {
    if (this.#listeners.has(event)) {
      this.#listeners.get(event)!.add(cb);
    } else {
      this.#listeners.set(event, new Set([cb]));
    }
  };
  off = (event: string, cb: (...a: any[]) => void) => {
    if (this.#listeners.has(event)) {
      this.#listeners.get(event)!.delete(cb);
    }
  };
  emit = (event: string, ...rest: any[]) => {
    if (this.#listeners.has(event)) {
      this.#listeners.get(event)!.forEach((cb) => cb(...rest));
    }
  };
  clean() {
    this.#listeners.clear();
  }
}
