import { databaseUrl } from './config';

describe('database configuration', () => {
  it('prefers the explicitly configured standard URL', () => {
    expect(databaseUrl({ DATABASE_URL: 'postgres://standard', XTR_DATABASE_URL: 'postgres://integration' }))
      .toBe('postgres://standard');
  });

  it('uses the Vercel integration URL when the standard variable is empty', () => {
    expect(databaseUrl({ DATABASE_URL: '  ', XTR_DATABASE_URL: ' postgres://integration ' }))
      .toBe('postgres://integration');
  });

  it('supports Postgres URL aliases and reports missing configuration', () => {
    expect(databaseUrl({ XTR_POSTGRES_URL: 'postgres://integration' })).toBe('postgres://integration');
    expect(databaseUrl({ POSTGRES_URL: 'postgres://standard' })).toBe('postgres://standard');
    expect(databaseUrl({})).toBeUndefined();
  });
});
