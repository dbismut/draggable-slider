import { useEffect, useRef } from 'react';

import { CarouselEngine } from '../CarouselEngine';
import type { CarouselEngineOptions } from '../CarouselEngine';

export const useCarousel = (
  element: React.MutableRefObject<HTMLElement | null>,
  { index = 0, mouseDrag }: CarouselEngineOptions = {}
) => {
  const engineRef = useRef(new CarouselEngine());
  const initialIndex = useRef(index);

  useEffect(() => {
    const engine = engineRef.current;
    if (element.current) {
      engine.init(element.current, {
        index: initialIndex.current,
        mouseDrag,
      });
    }
    return engine.clean;
    // we know element is a stable ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return engineRef;
};
