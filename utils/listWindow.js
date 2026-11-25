/**
 * Which items of a list are on screen. Pure function.
 *
 * The highlight moves through the visible items, and the window only slides
 * when the highlight would leave it: the page does not move while you swipe
 * through the rows that are already showing.
 *
 *   visibleWindow(heights, prevStart, selected, budget) -> { start, end }
 *
 *   heights    the height of each item (any unit, e.g. pixels, or 1 for uniform rows)
 *   prevStart  the first visible item last time (0 on first show)
 *   selected   the highlighted item
 *   budget     how much height fits on screen, in the same unit
 *
 * Items [start, end) are shown. The selected item is always inside, even if
 * it alone is taller than the budget.
 */
export function visibleWindow(heights, prevStart, selected, budget) {
  const n = heights.length;
  if (!n) return { start: 0, end: 0 };
  const sel = Math.max(0, Math.min(selected, n - 1));

  // Start where we were, but never after the selection (moving up past the top
  // edge scrolls up so the selection sits on the top row).
  let start = Math.max(0, Math.min(prevStart || 0, sel));

  // Moving down past the bottom edge: slide just far enough to fit the selection.
  let used = 0;
  for (let i = start; i <= sel; i++) used += heights[i];
  while (start < sel && used > budget) {
    used -= heights[start];
    start++;
  }

  // Show as many following items as fit.
  let end = sel + 1;
  while (end < n && used + heights[end] <= budget) {
    used += heights[end];
    end++;
  }
  return { start: start, end: end };
}

/** n items of the same height. */
export function uniformHeights(n, height) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(height === undefined ? 1 : height);
  return out;
}
