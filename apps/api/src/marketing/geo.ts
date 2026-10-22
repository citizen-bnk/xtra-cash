import type { LocationTarget } from '@xtra/shared';
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180, dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function confidentlyInside(point: { latitude: number; longitude: number; accuracy: number }, target: LocationTarget) {
  return distanceMeters(point, target) + point.accuracy <= target.radiusMeters;
}
export function saDay(now: Date) { return new Date(+now + 2 * 3600000).toISOString().slice(0, 10); }
export function quietHours(now: Date) { const h = (now.getUTCHours() + 2) % 24; return h < 8 || h >= 20; }
