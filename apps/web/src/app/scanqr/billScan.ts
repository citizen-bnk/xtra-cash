export type Point = { x: number; y: number };
export type BillItem = { id: string; label: string; cents: number };
export type ParsedBill = { merchant: string; reference: string; totalCents: number; items: BillItem[]; warnings: string[] };

const amountAtEnd = /(?:\bR\s*)?(\d{1,5}(?:[ ,.']\d{3})*[.,]\d{2})\s*$/i;
const centsOf = (value: string) => {
  const normalized = value.replace(/[\s']/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
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
  return { merchant, reference, totalCents, items, warnings };
}

export function detectCorners(image: ImageData): Point[] {
  const { width, height, data } = image;
  const samples: Point[] = [];
  const step = Math.max(2, Math.floor(Math.min(width, height) / 130));
  for (let y = step; y < height - step; y += step) for (let x = step; x < width - step; x += step) {
    const i = (y * width + x) * 4;
    const right = (y * width + x + step) * 4;
    const below = ((y + step) * width + x) * 4;
    const lum = (offset: number) => .299 * data[offset] + .587 * data[offset + 1] + .114 * data[offset + 2];
    const contrast = Math.max(Math.abs(lum(i) - lum(right)), Math.abs(lum(i) - lum(below)));
    if (contrast > 65) samples.push({ x: x / width, y: y / height });
  }
  if (samples.length < 30) return [{ x: .06, y: .06 }, { x: .94, y: .06 }, { x: .94, y: .94 }, { x: .06, y: .94 }];
  const minX = Math.max(.02, Math.min(...samples.map(p => p.x)) - .025);
  const maxX = Math.min(.98, Math.max(...samples.map(p => p.x)) + .025);
  const minY = Math.max(.02, Math.min(...samples.map(p => p.y)) - .025);
  const maxY = Math.min(.98, Math.max(...samples.map(p => p.y)) + .025);
  return [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
}

export function flattenDocument(source: HTMLCanvasElement, corners: Point[]): HTMLCanvasElement {
  const width = 1200;
  const height = Math.min(2200, Math.max(700, Math.round(width * source.height / source.width)));
  const output = document.createElement('canvas');
  output.width = width; output.height = height;
  const sourceData = source.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, source.width, source.height);
  const target = output.getContext('2d')!;
  const result = target.createImageData(width, height);
  const [tl, tr, br, bl] = corners;
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const px = Math.min(source.width - 1, Math.max(0, Math.round(((1-u)*(1-v)*tl.x + u*(1-v)*tr.x + u*v*br.x + (1-u)*v*bl.x) * source.width)));
      const py = Math.min(source.height - 1, Math.max(0, Math.round(((1-u)*(1-v)*tl.y + u*(1-v)*tr.y + u*v*br.y + (1-u)*v*bl.y) * source.height)));
      const from = (py * source.width + px) * 4;
      const to = (y * width + x) * 4;
      result.data[to] = sourceData.data[from]; result.data[to+1] = sourceData.data[from+1]; result.data[to+2] = sourceData.data[from+2]; result.data[to+3] = 255;
    }
  }
  target.putImageData(result, 0, 0);
  return output;
}
