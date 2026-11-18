/**
 * Izgara şehirde yol takibi (Manhattan rotası). Başlangıç ve hedef yol ağı üzerinde olmalı.
 * Trafik / kapalı yol / barikat gelince burası A* ile değiştirilebilir.
 */
export function roadPath(world, from, to) {
  // Hedef bir dikey yolun ortasındaysa: önce o yolun en yakın kavşağına, sonra hedefe
  if (!world.isOnRoadLine(to.z)) {
    const p = roadPath(world, from, { x: world.snapToRoadLine(to.x), z: world.snapToRoadLine(to.z) });
    p.push({ x: to.x, z: to.z });
    return p;
  }

  const path = [];
  let cx = from.x;
  let cz = from.z;

  // Dikey yoldaysak önce hedef yönündeki yatay yola in
  if (!world.isOnRoadLine(cz)) {
    const bs = world.blockSize;
    const idx = (cz + world.half) / bs;
    const nextIdx = to.z > cz ? Math.ceil(idx) : Math.floor(idx);
    cx = world.snapToRoadLine(cx);
    cz = nextIdx * bs - world.half;
    path.push({ x: cx, z: cz });
  }

  if (Math.abs(cz - to.z) < 0.01) {
    path.push({ x: to.x, z: to.z });
    return path;
  }

  const vx = world.snapToRoadLine((cx + to.x) / 2);
  if (Math.abs(vx - cx) > 0.01) path.push({ x: vx, z: cz });
  path.push({ x: vx, z: to.z });
  path.push({ x: to.x, z: to.z });
  return path;
}

// Yol boyunca ilerletir; hedefe varınca true döner
export function stepAlongPath(entity, step) {
  while (step > 0 && entity.path.length) {
    const wp = entity.path[0];
    const dx = wp.x - entity.x;
    const dz = wp.z - entity.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.001) entity.rotY = Math.atan2(dx, dz);
    if (dist <= step) {
      entity.x = wp.x;
      entity.z = wp.z;
      step -= dist;
      entity.path.shift();
    } else {
      entity.x += (dx / dist) * step;
      entity.z += (dz / dist) * step;
      step = 0;
    }
  }
  return entity.path.length === 0;
}
