import { CarouselEngine } from '../CarouselEngine';

const items = Array.from({ length: 10 }).map(
  (_, i) => 'https://picsum.photos/1200/600?random=' + i
);

const main = document.querySelector('main')!;
const scroller = document.querySelector('ul.scroller')! as HTMLUListElement;
const nav = document.querySelector('nav')!;
const input = nav.querySelector('input')!;
const select = nav.querySelector('select')!;
const [prevButton, nextButton] = nav.querySelectorAll(
  ' button'
)! as NodeListOf<HTMLButtonElement>;

const slidesHTML = items
  .map(
    (url, i) =>
      `<li tabindex="-1"><div><img src="${url}" alt="" /></div><span>Slide ${i}</span></li>`
  )
  .join('');

scroller.innerHTML = slidesHTML;

const engine = new CarouselEngine();
engine.init(scroller, { mouseDrag: true });

const onChange = () => {
  input.value = '' + engine.index;
  prevButton.disabled = !engine.canScrollPrev;
  nextButton.disabled = !engine.canScrollNext;
};

engine.on('change', onChange);
engine.on('ready', onChange);

input.addEventListener('change', (e) => {
  const newIndex = parseInt((e.target as HTMLInputElement).value);
  if (isFinite(newIndex)) engine.index = newIndex;
  else input.value = '' + engine.index;
});

prevButton.addEventListener('click', () => engine.index--);
nextButton.addEventListener('click', () => engine.index++);

select.addEventListener('change', (e) => {
  const alignment = (e.target as HTMLSelectElement).value;

  main.style.setProperty(
    '--scrollSnapType',
    !!alignment ? 'x mandatory' : 'none'
  );
  main.style.setProperty('--scrollSnapAlign', alignment || 'none');

  setTimeout(engine.layout, 100);
});
