<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useCarousel } from './useCarousel';

const items = Array.from({ length: 10 }).map(
  (_, i) => 'https://picsum.photos/1200/600?random=' + i
);

const el = ref<HTMLUListElement>(null);
const engine = useCarousel(el, { mouseDrag: true });
const index = ref(0);

const alignment = ref('');
const canScrollPrev = ref(false);
const canScrollNext = ref(false);

watch(alignment, () => setTimeout(engine.layout, 100));

const onChange = () => {
  index.value = engine.index;
  canScrollPrev.value = engine.canScrollPrev;
  canScrollNext.value = engine.canScrollNext;
};

onMounted(() => {
  engine.on('change', onChange);
  engine.on('ready', onChange);
});

onUnmounted(() => {
  engine.off('change', onChange);
  engine.off('ready', onChange);
});
</script>
<template>
  <main
    :style="{
      '--scrollSnapType': !!alignment ? 'x mandatory' : 'none',
      '--scrollSnapAlign': alignment || 'none',
    }"
  >
    <nav>
      Scroll Snap:
      <select
        :value="alignment"
        @change="alignment = ($event.target as HTMLSelectElement).value"
      >
        <option value="start">Start</option>
        <option value="center">Center</option>
        <option value="end">End</option>
        <option value="">No Snap</option>
      </select>
      <button :disabled="!canScrollPrev" @click="engine.index--">Prev</button>
      <input
        type="text"
        :value="index"
        @change="
          engine.index = parseInt(($event.target as HTMLInputElement).value)
        "
      />
      <button :disabled="!canScrollNext" @click="engine.index++">Next</button>
    </nav>
    <ul ref="el" class="scroller">
      <li v-for="(url, i) in items" key="i" tabindex="-1">
        <div>
          <img :src="url" alt="" />
        </div>
        <span>Slide {{ i }}</span>
      </li>
    </ul>
  </main>
</template>
