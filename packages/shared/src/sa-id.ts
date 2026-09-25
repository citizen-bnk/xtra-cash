/**
 * South African ID number helpers (YYMMDD SSSS C A Z).
 * Validates the Luhn check digit and extracts date of birth and gender.
 */

export interface SaIdInfo {
  valid: boolean;
  dateOfBirth?: Date;
  gender?: 'F' | 'M';
  citizen?: boolean;
  reason?: string;
}

function luhnValid(id: string): boolean {
  let sum = 0;
  for (let i = 0; i < id.length; i++) {
    let d = Number(id[id.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function parseSaId(raw: string, now: Date = new Date()): SaIdInfo {
  const id = (raw || '').replace(/\s/g, '');
  if (!/^\d{13}$/.test(id)) return { valid: false, reason: 'ID number must be 13 digits' };
  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  const currentYY = now.getUTCFullYear() % 100;
  const year = yy > currentYY ? 1900 + yy : 2000 + yy;
  const dob = new Date(Date.UTC(year, mm - 1, dd));
  if (dob.getUTCMonth() !== mm - 1 || dob.getUTCDate() !== dd) return { valid: false, reason: 'ID number has an invalid date of birth' };
  const citizenDigit = id[10];
  if (citizenDigit !== '0' && citizenDigit !== '1') return { valid: false, reason: 'ID number has an invalid citizenship digit' };
  if (!luhnValid(id)) return { valid: false, reason: 'ID number check digit is invalid' };
  return {
    valid: true,
    dateOfBirth: dob,
    gender: Number(id.slice(6, 10)) < 5000 ? 'F' : 'M',
    citizen: citizenDigit === '0',
  };
}

export function ageOn(dob: Date, on: Date = new Date()): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** Builds a valid SA ID for a given date of birth (used by seeds and tests). */
export function makeSaId(dob: Date, seq = 5000, citizen = true): string {
  const yy = String(dob.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(dob.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dob.getUTCDate()).padStart(2, '0');
  const base = `${yy}${mm}${dd}${String(seq).padStart(4, '0')}${citizen ? '0' : '1'}8`;
  for (let c = 0; c <= 9; c++) {
    if (luhnValid(base + c)) return base + c;
  }
  throw new Error('unreachable');
}
