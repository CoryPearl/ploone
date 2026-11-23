// Test pilot only: inspect the generated height field and search for a route.
// The game never imports this module, and the generator never sees its output.
export function planRoute(world, course, preference = 0, { clearance = 250 } = {}) {
  const region = world.region, altitude = Math.min(course.ceiling - 105, region.base + 710);
  const columns = Math.ceil(region.length / 220), halfRows = Math.ceil((region.halfWidth + 1400) / 220), width = halfRows * 2 + 1;
  const point = (column, row) => ({ x: region.start.x + region.direction.x * region.length * column / columns + region.side.x * (row - halfRows) * 220,
    z: region.start.z + region.direction.z * region.length * column / columns + region.side.z * (row - halfRows) * 220, y: altitude });
  const clear = (a, b) => {
    const count = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 75);
    for (let i = 0; i <= count; i++) { const t = count ? i / count : 0; if (world.height(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) > altitude - clearance) return false; }
    return true;
  };
  const minColumn = -2, maxColumn = columns + 5, size = (maxColumn - minColumn + 1) * width;
  const indexOf = (column, row) => (column - minColumn) * width + row;
  const position = index => point(Math.floor(index / width) + minColumn, index % width);
  const start = indexOf(0, halfRows), finish = indexOf(columns, halfRows);
  const costs = new Float64Array(size).fill(Infinity), previous = new Int32Array(size).fill(-1), closed = new Uint8Array(size);
  const passable = new Int8Array(size), heap = [];
  function push(item) {
    heap.push(item); let child = heap.length - 1;
    while (child > 0) { const parent = (child - 1) >> 1; if (heap[parent].cost <= item.cost) break; heap[child] = heap[parent]; child = parent; }
    heap[child] = item;
  }
  function pop() {
    const first = heap[0], last = heap.pop(); if (!heap.length) return first;
    let parent = 0;
    while (parent * 2 + 1 < heap.length) {
      let child = parent * 2 + 1; if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
      if (heap[child].cost >= last.cost) break; heap[parent] = heap[child]; parent = child;
    }
    heap[parent] = last; return first;
  }
  costs[start] = 0; push({ index: start, cost: 0 });
  while (heap.length) {
    const { index } = pop(); if (closed[index]) continue; if (index === finish) break; closed[index] = 1;
    const column = Math.floor(index / width) + minColumn, row = index % width, a = position(index);
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      const c = column + dc, r = row + dr;
      if ((!dc && !dr) || c < minColumn || c > maxColumn || r < 0 || r >= width) continue;
      const next = indexOf(c, r); if (closed[next]) continue;
      const b = position(next);
      if (!passable[next]) passable[next] = world.height(b.x, b.z) < altitude - clearance ? 1 : -1;
      if (passable[next] < 0 || !clear(a, b)) continue;
      const cost = costs[index] + Math.hypot(a.x - b.x, a.z - b.z) * (1 + Math.max(0, (r - halfRows) / halfRows * preference) * 2);
      if (cost >= costs[next]) continue;
      costs[next] = cost; previous[next] = index;
      push({ index: next, cost: cost + Math.hypot(b.x - course.finish.x, b.z - course.finish.z) });
    }
  }
  if (!Number.isFinite(costs[finish])) throw new Error(`No open route for test pilot: ${world.seed}`);
  const path = [];
  for (let index = finish; index >= 0; index = previous[index]) path.push(position(index));
  path.reverse();
  // Skip visible waypoints so a fixed-wing aircraft gets long, smooth legs.
  const smooth = [path[0]]; let index = 0;
  while (index < path.length - 1) {
    let next = path.length - 1; while (next > index + 1 && !clear(path[index], path[next])) next--;
    smooth.push(path[next]); index = next;
  }
  // Launch/approach clearings allow gradual climbs and descents.
  smooth[0] = { ...course.spawn };
  const climb = point(Math.min(columns, 4), halfRows);
  if (clear(climb, smooth[1])) smooth.splice(1, 0, climb);
  smooth[smooth.length - 1] = { ...course.finish };
  const approach = point(columns - 2, halfRows);
  if (clear(smooth.at(-2), approach)) smooth.splice(smooth.length - 1, 0, approach);
  return smooth;
}
