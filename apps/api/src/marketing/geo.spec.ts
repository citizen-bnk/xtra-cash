import { confidentlyInside, distanceMeters, quietHours, saDay } from './geo';
describe('location campaigns', () => {
  const target = { latitude: -26.034, longitude: 28.046, radiusMeters: 500, label: 'Test venue' };
  it('checks actual distance and the reported accuracy, not just a device claim of entry', () => {
    expect(distanceMeters(target, target)).toBe(0);
    expect(confidentlyInside({ ...target, accuracy: 10 }, target)).toBe(true);
    expect(confidentlyInside({ ...target, accuracy: 501 }, target)).toBe(false);
    expect(confidentlyInside({ latitude: -26.05, longitude: 28.046, accuracy: 1 }, target)).toBe(false);
  });
  it('applies South African quiet hours at the exact boundaries', () => {
    expect(quietHours(new Date('2026-10-22T05:59:59Z'))).toBe(true);
    expect(quietHours(new Date('2026-10-22T06:00:00Z'))).toBe(false);
    expect(quietHours(new Date('2026-10-22T17:59:59Z'))).toBe(false);
    expect(quietHours(new Date('2026-10-22T18:00:00Z'))).toBe(true);
    expect(saDay(new Date('2026-10-22T22:00:00Z'))).toBe('2026-10-23');
  });
});
