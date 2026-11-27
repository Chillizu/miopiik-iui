const LABEL_GAP = 2

function overlapsHorizontally(a, b) {
  return a.left < b.right && b.left < a.right
}

function nearbyOffset(label, obstacles, frame) {
  const limit = Math.min(32, label.size * 1.5)
  const min = Math.max(-limit, frame.y - label.top)
  const max = Math.min(limit, frame.bottom - label.bottom)
  if (min > max || label.left < frame.x || label.right > frame.right) return 0

  // Each open interval contains the offsets that would leave less than LABEL_GAP.
  const blocked = obstacles.filter((box) => overlapsHorizontally(label, box)).map((box) => ({
    start: box.top - label.bottom - LABEL_GAP,
    end: box.bottom - label.top + LABEL_GAP,
  })).sort((a, b) => a.start - b.start)

  const nearest = Math.max(min, Math.min(0, max))
  let below = nearest
  for (const { start, end } of blocked) {
    if (below <= start) break
    if (below < end) below = end
  }

  let above = nearest
  for (let i = blocked.length - 1; i >= 0; i -= 1) {
    const { start, end } = blocked[i]
    if (start < above && above < end) above = start
  }

  if (above >= min && (below > max || Math.abs(above) <= Math.abs(below))) return above
  return below <= max ? below : 0
}

/** Return vertical offsets for ordered label boxes in a shared SVG coordinate space. */
export function placeDrawingLabels(labels, frame) {
  const placed = []
  return labels.map((label, index) => {
    const overlaps = placed.some((box) => overlapsHorizontally(label, box)
      && label.top < box.bottom && box.top < label.bottom)
    // Preserve room for upcoming labels at their authored positions.
    const offset = overlaps ? nearbyOffset(label, [...placed, ...labels.slice(index + 1)], frame) : 0
    placed.push(offset === 0 ? label : { ...label, top: label.top + offset, bottom: label.bottom + offset })
    return offset
  })
}
