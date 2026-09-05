import { useCallback, useEffect, useRef, useState } from 'react';
import { canWalk, findVillagePath, nearestWalkable, type TilePoint, type VillageNavigation } from './villagePathfinding.js';

const SPEED = 8;
export type PlayerDirection = 'up' | 'down' | 'left' | 'right';

export function useVillagePlayer(navigation: VillageNavigation, entrance: TilePoint) {
  const [position, setPosition] = useState(() => nearestWalkable(navigation, entrance));
  const [direction, setDirection] = useState<PlayerDirection>('up');
  const [walking, setWalking] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const positionRef = useRef(position);
  const route = useRef<TilePoint[]>([]);
  const arrival = useRef<(() => void) | undefined>();

  const stop = useCallback(() => { route.current = []; arrival.current = undefined; setWalking(false); }, []);
  const place = useCallback((point: TilePoint) => { positionRef.current = point; setPosition(point); }, []);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(query.matches);
    query.addEventListener?.('change', change);
    return () => query.removeEventListener?.('change', change);
  }, []);

  // Geometry changes may invalidate a route. Source refreshes with identical geometry do not.
  useEffect(() => {
    stop();
    const rounded = { x: Math.round(positionRef.current.x), y: Math.round(positionRef.current.y) };
    if (!canWalk(navigation, rounded)) place(nearestWalkable(navigation, rounded));
  }, [navigation, stop, place]);

  const move = useCallback((destination: TilePoint, onArrival?: () => void): boolean => {
    const current = positionRef.current;
    const start = { x: Math.round(current.x), y: Math.round(current.y) };
    const path = findVillagePath(navigation, start, destination);
    if (path === null) { stop(); return false; }
    arrival.current = onArrival;
    if (reducedMotion || (path.length === 0 && current.x === start.x && current.y === start.y)) {
      route.current = [];
      setWalking(false);
      place(destination);
      arrival.current = undefined;
      onArrival?.();
      return true;
    }
    // Finish the partial tile segment before changing direction, avoiding diagonal corner cuts.
    route.current = current.x !== start.x || current.y !== start.y ? [start, ...path] : path;
    setWalking(true);
    return true;
  }, [navigation, reducedMotion, place, stop]);

  useEffect(() => {
    if (!walking) return;
    let frame = 0;
    let previous: number | undefined;
    const animate = (time: number) => {
      let distance = Math.min(64, previous === undefined ? 0 : time - previous) / 1000 * SPEED;
      previous = time;
      let current = positionRef.current;
      while (route.current.length > 0) {
        const next = route.current[0]!;
        const dx = next.x - current.x;
        const dy = next.y - current.y;
        const remaining = Math.abs(dx) + Math.abs(dy);
        if (remaining > 0) setDirection(dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up');
        if (remaining > distance) {
          current = { x: current.x + dx / remaining * distance, y: current.y + dy / remaining * distance };
          break;
        }
        current = next;
        distance -= remaining;
        route.current.shift();
      }
      place(current);
      if (route.current.length === 0) {
        setWalking(false);
        const onArrival = arrival.current;
        arrival.current = undefined;
        onArrival?.();
      } else frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [walking, place]);

  useEffect(() => {
    if (!reducedMotion || route.current.length === 0) return;
    place(route.current[route.current.length - 1]!);
    route.current = [];
    setWalking(false);
    const onArrival = arrival.current;
    arrival.current = undefined;
    onArrival?.();
  }, [reducedMotion, place]);

  return { position, positionRef, direction, walking, reducedMotion, move, stop };
}
