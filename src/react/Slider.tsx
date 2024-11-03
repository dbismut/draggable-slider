import { useRef, useEffect, useState } from 'react';
import { useCarousel } from './useCarousel';

const items = Array.from({ length: 10 }).map(
  (_, i) => 'https://picsum.photos/1200/600?random=' + i
);

export default function Slider() {
  const el = useRef<HTMLUListElement>(null);
  const engine = useCarousel(el, { mouseDrag: true });
  const [alignment, setAlignment] = useState('');
  const [index, setIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(true);

  const setScrollAlignment = (value: string) => {
    setAlignment(value);
    setTimeout(() => engine.current.layout(), 100);
  };

  useEffect(() => {
    const eng = engine.current;
    const onChange = () => {
      setIndex(eng.index);
      setCanScrollPrev(eng.canScrollPrev);
      setCanScrollNext(eng.canScrollNext);
    };
    eng.on('change', onChange);
    eng.on('ready', onChange);
    return () => {
      eng.off('change', onChange);
      eng.off('ready', onChange);
    };
  }, [engine]);

  return (
    <main
      style={
        {
          '--scrollSnapType': alignment ? 'x mandatory' : 'none',
          '--scrollSnapAlign': alignment || 'none',
        } as React.CSSProperties
      }
    >
      <nav>
        Scroll Snap:
        <select
          value={alignment}
          onChange={(e) => setScrollAlignment(e.target.value)}
        >
          <option value="start">Start</option>
          <option value="center">Center</option>
          <option value="end">End</option>
          <option value="">No Snap</option>
        </select>
        <button
          disabled={!canScrollPrev}
          onClick={() => engine.current.index--}
        >
          Prev
        </button>
        <input
          type="text"
          value={index}
          onChange={(e) => (engine.current.index = parseInt(e.target.value))}
        />
        <button
          disabled={!canScrollNext}
          onClick={() => engine.current.index++}
        >
          Next
        </button>
      </nav>
      <ul ref={el} className="scroller">
        {items.map((url, i) => (
          <li key={i} tabIndex={-1}>
            <div>
              <img src={url} alt="" />
            </div>
            <span>Slide {i}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
