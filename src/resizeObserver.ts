export type ResizeObserverCallback = (
  entry: ResizeObserverEntry,
  observer: ResizeObserver
) => any;

const createResizeObserver = (polyfill?: any) => {
  let ticking = false;
  let allEntries: ResizeObserverEntry[] = [];

  const callbacks: Map<any, Array<ResizeObserverCallback>> = new Map();

  const observer = new (polyfill || window.ResizeObserver)(
    (entries: ResizeObserverEntry[], obs: ResizeObserver) => {
      allEntries = allEntries.concat(entries);
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const triggered = new Set<Element>();
          for (let i = 0; i < allEntries.length; i++) {
            if (triggered.has(allEntries[i].target)) {
              continue;
            }
            triggered.add(allEntries[i].target);
            const cbs = callbacks.get(allEntries[i].target);
            cbs?.forEach((cb) => cb(allEntries[i], obs));
          }
          allEntries = [];
          ticking = false;
        });
      }
      ticking = true;
    }
  );

  return {
    observer: observer as ResizeObserver,
    subscribe(target: Element, callback: ResizeObserverCallback) {
      observer.observe(target);
      const cbs = callbacks.get(target) ?? [];
      cbs.push(callback);
      callbacks.set(target, cbs);
    },
    unsubscribe(target: Element, callback: ResizeObserverCallback) {
      const cbs = callbacks.get(target) ?? [];
      if (cbs.length === 1) {
        observer.unobserve(target);
        callbacks.delete(target);
        return;
      }
      const cbIndex = cbs.indexOf(callback);
      if (cbIndex !== -1) {
        cbs.splice(cbIndex, 1);
      }
      callbacks.set(target, cbs);
    },
  };
};

let _resizeObserver: ReturnType<typeof createResizeObserver>;

export const getResizeObserver = (polyfill?: any) =>
  !_resizeObserver
    ? (_resizeObserver = createResizeObserver(polyfill))
    : _resizeObserver;
