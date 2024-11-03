import { onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';

import { CarouselEngine } from '../CarouselEngine';
import type { CarouselEngineOptions } from '../CarouselEngine';

export const useCarousel = (
  element: Ref<HTMLElement | null>,
  { index = 0, mouseDrag }: CarouselEngineOptions = {}
) => {
  const engine = new CarouselEngine();

  onMounted(() => {
    if (element.value) {
      engine.init(element.value, {
        index: index,
        mouseDrag,
      });
    }
  });

  onUnmounted(() => engine.clean());

  return engine;
};
