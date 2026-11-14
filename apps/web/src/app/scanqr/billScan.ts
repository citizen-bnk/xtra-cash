export type Point = { x: number; y: number };
export type BillItem = { id: string; label: string; cents: number };
export type ParsedBill = { merchant: string; reference: string; totalCents: number; items: BillItem[]; warnings: string[] };

const amountAtEnd = /(?:\bR\s*)?(\d{1,5}(?:[ ,.']\d{3})*[.,]\d{2})\s*$/i;
const centsOf = (value: string) => {
  const normalized = value.slice(0, -3).replace(/[^0-9]/g, '') + '.' + value.slice(-2);
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

export function parseBillText(text: string): ParsedBill {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const warnings: string[] = [];
  const merchant = lines.find(line => !/^\d|^tax\b|^vat\b/i.test(line))?.slice(0, 80) ?? '';
  const reference = lines.find(line => /(?:bill|receipt|invoice|check|table)\s*(?:no\.?|number|#|ref\.?|:)/i.test(line))
    ?.match(/(?:bill|receipt|invoice|check|table)\s*(?:no\.?|number|#|ref\.?|:)?\s*([A-Z0-9-]{2,30})/i)?.[1] ?? '';
  const totalLine = [...lines].reverse().find(line => /(?:grand\s*total|amount\s*due|balance\s*due|^total\b)/i.test(line) && amountAtEnd.test(line));
  const totalCents = totalLine ? centsOf(totalLine.match(amountAtEnd)![1]) : 0;
  const items = lines.flatMap((line, index) => {
    if (/\b(total|subtotal|vat|tax|change|cash|balance|discount|tip|service|card|payment|paid)\b/i.test(line)) return [];
    const match = line.match(amountAtEnd);
    if (!match) return [];
    const cents = centsOf(match[1]);
    const label = line.slice(0, match.index).replace(/^\d+\s*[xX*]\s*/, '').replace(/[.·\s-]+$/, '').trim();
    return cents > 0 && label.length > 1 ? [{ id: `item-${index}`, label: label.slice(0, 70), cents }] : [];
  }).slice(0, 35);
  if (!merchant) warnings.push('Restaurant name needs confirmation.');
  if (!reference) warnings.push('Bill reference needs confirmation.');
  if (!totalCents) warnings.push('Total was not read. Enter it from the bill.');
  if (!items.length) warnings.push('Items were not read. Add them manually to split this bill.');
  if (items.length && totalCents && items.reduce((sum, item) => sum + item.cents, 0) !== totalCents) {
    warnings.push('The scanned items do not match the total. Check charges, discounts and quantities before paying.');
  }
  return { merchant, reference, totalCents, items, warnings };
}

export function detectCorners(image: ImageData): Point[] {
  const { width, height, data } = image;
  const step = Math.max(2, Math.floor(Math.min(width, height) / 180));
  const columns = Math.floor(width / step), rows = Math.floor(height / step);
  const mask = new Uint8Array(columns * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const i = (y * step * width + x * step) * 4;
    const light = .299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2];
    if (light > 166) mask[y * columns + x] = 1;
  }
  let largest: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const group = [i];
    mask[i] = 0;
    for (let j = 0; j < group.length; j++) {
      const cell = group[j], x = cell % columns;
      for (const n of [x ? cell - 1 : -1, x < columns - 1 ? cell + 1 : -1, cell - columns, cell + columns]) {
        if (mask[n]) { mask[n] = 0; group.push(n); }
      }
    }
    if (group.length > largest.length) largest = group;
  }
  const full = [{ x: .02, y: .02 }, { x: .98, y: .02 }, { x: .98, y: .98 }, { x: .02, y: .98 }];
  if (largest.length < mask.length * .12 || largest.length > mask.length * .94) return full;
  const points = largest.map(i => ({ x: (i % columns) * step / width, y: Math.floor(i / columns) * step / height }));
  const scores = [(p: Point) => p.x + p.y, (p: Point) => 1 - p.x + p.y, (p: Point) => 2 - p.x - p.y, (p: Point) => 1 + p.x - p.y];
  const corners = scores.map(score => points.reduce((best, p) => score(p) < score(best) ? p : best));
  return validCrop(corners) ? corners : full;
}

export function validCrop(corners: Point[]) {
  return corners.length === 4 && corners.every((a, i) => {
    const b = corners[(i + 1) % 4], c = corners[(i + 2) % 4];
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > .005;
  });
}

export function flattenDocument(source: HTMLCanvasElement, corners: Point[]): HTMLCanvasElement {
  if (!validCrop(corners)) throw new Error('Move the corners to form a rectangle around the receipt.');
  const [tl, tr, br, bl] = corners;
  const distance = (a: Point, b: Point) => Math.hypot((a.x - b.x) * source.width, (a.y - b.y) * source.height);
  const rawWidth = Math.max(distance(tl, tr), distance(bl, br));
  const rawHeight = Math.max(distance(tl, bl), distance(tr, br));
  const scale = Math.min(1200 / rawWidth, 2600 / rawHeight, 1.5);
  const width = Math.max(2, Math.round(rawWidth * scale));
  const height = Math.max(2, Math.round(rawHeight * scale));
  const output = document.createElement('canvas');
  output.width = width; output.height = height;
  const sourceData = source.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, source.width, source.height);
  const target = output.getContext('2d')!;
  const result = target.createImageData(width, height);
  const dx = tl.x - tr.x + br.x - bl.x, dy = tl.y - tr.y + br.y - bl.y;
  const ax = tr.x - br.x, ay = tr.y - br.y, bx = bl.x - br.x, by = bl.y - br.y;
  const determinant = ax * by - bx * ay;
  const g = (dx * by - bx * dy) / determinant;
  const h = (ax * dy - dx * ay) / determinant;
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const z = 1 + g * u + h * v;
      const px = Math.min(source.width - 1, Math.max(0, Math.round((tl.x + ((1+g)*tr.x-tl.x)*u + ((1+h)*bl.x-tl.x)*v) / z * source.width)));
      const py = Math.min(source.height - 1, Math.max(0, Math.round((tl.y + ((1+g)*tr.y-tl.y)*u + ((1+h)*bl.y-tl.y)*v) / z * source.height)));
      const from = (py * source.width + px) * 4;
      const to = (y * width + x) * 4;
      const luminance = .299 * sourceData.data[from] + .587 * sourceData.data[from+1] + .114 * sourceData.data[from+2];
      const grey = Math.max(0, Math.min(255, (luminance - 22) * 1.19));
      result.data[to] = grey;
      result.data[to+1] = grey;
      result.data[to+2] = grey;
      result.data[to+3] = 255;
    }
  }
  target.putImageData(result, 0, 0);
  return output;
}
