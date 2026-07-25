/**
 * FLIP animation for the chart.
 *
 * When the arrangement changes, every cell that survives the change is
 * transformed back to where it used to be and then released, so the reader can
 * follow a given opcode to its new home instead of the whole chart blinking
 * into a different shape.
 *
 * Positions are measured in document coordinates, not viewport coordinates,
 * because re-laying out changes the page height and can move the scroll
 * position between the two measurements.
 */

/** A position in document space, immune to scrolling between measurements. */
interface Spot {
  x: number;
  y: number;
}

const MOVING = 'moving';

function measure(elements: Iterable<Element>): Map<string, Spot> {
  const spots = new Map<string, Spot>();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  for (const el of elements) {
    const key = (el as HTMLElement).dataset['key'];
    if (!key) continue;
    const rect = el.getBoundingClientRect();
    spots.set(key, { x: rect.left + scrollX, y: rect.top + scrollY });
  }
  return spots;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Runs `mutate` and animates the difference.
 *
 * All reads happen before all writes on each side of the mutation, so the
 * browser does two layouts rather than one per element.
 *
 * `animate` is off for changes that happen while the reader is still acting —
 * every keystroke of a search re-lays out the chart, and animating a cell
 * across the page only for the next letter to move it again is noise, not
 * continuity.
 */
export function flip(container: HTMLElement, mutate: () => void, animate = true): void {
  if (!animate || prefersReducedMotion()) {
    mutate();
    return;
  }

  const before = measure(container.children);
  mutate();
  const after = measure(container.children);

  /*
   * Only what the reader could actually watch.
   *
   * The chart is thirty thousand pixels tall and a rearrangement moves nearly
   * every cell in it, so animating all of them meant hundreds of transitions
   * and web animations running for a journey nobody was looking at — the whole
   * cost of the effect, off screen, for none of the benefit. Anything outside
   * the band simply appears in its new place.
   *
   * A screen's worth of margin either side, so a cell that travels in from just
   * beyond the edge still arrives rather than materialising at the boundary.
   */
  const margin = window.innerHeight;
  const top = window.scrollY - margin;
  const bottom = window.scrollY + window.innerHeight + margin;
  const watchable = (spot: Spot | undefined) => spot && spot.y >= top && spot.y <= bottom;

  const moved: HTMLElement[] = [];
  for (const el of Array.from(container.children) as HTMLElement[]) {
    const key = el.dataset['key'];
    if (!key) continue;
    const from = before.get(key);
    const to = after.get(key);
    if (!watchable(from) && !watchable(to)) continue;
    if (!from || !to) {
      // Newly present: it has nowhere to travel from, so fade it up instead.
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
      continue;
    }
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    if (dx === 0 && dy === 0) continue;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    moved.push(el);
  }

  if (!moved.length) return;

  // Suppress hover highlighting while things are in flight, so the pointer
  // does not light up whatever happens to slide underneath it.
  container.classList.add('settling');

  requestAnimationFrame(() => {
    for (const el of moved) {
      el.classList.add(MOVING);
      el.style.transform = '';
    }
  });

  const settle = () => {
    for (const el of moved) el.classList.remove(MOVING);
    container.classList.remove('settling');
  };

  // transitionend is unreliable when an element is interrupted mid-flight, so
  // a timer backstops it.
  const duration = readDuration(container);
  window.setTimeout(settle, duration + 60);
}

/** Reads the `--move` custom property so CSS stays the single source of truth. */
function readDuration(el: HTMLElement): number {
  const raw = getComputedStyle(el).getPropertyValue('--move').trim();
  if (raw.endsWith('ms')) return parseFloat(raw) || 320;
  if (raw.endsWith('s')) return (parseFloat(raw) || 0.32) * 1000;
  return 320;
}
