import { DemoService } from './demo.service';

describe('hosted demo access', () => {
  const originalNode = process.env.NODE_ENV, originalFlag = process.env.ENABLE_DEMO_LOGIN;
  let service: DemoService, rows: any[], auth: any, db: any;
  beforeEach(() => {
    process.env.NODE_ENV = 'production'; process.env.ENABLE_DEMO_LOGIN = 'true';
    rows = [{ id: 'sample-only', email: 'naledi@example.com', roles: ['CONSUMER'], status: 'ACTIVE', passwordHash: 'private' }];
    db = { query: { users: { findMany: jest.fn(async () => rows) } } };
    auth = { issueTokens: jest.fn(async () => ({ accessToken: 'fixture', refreshToken: 'fixture' })) };
    service = new DemoService(db, auth, { log: jest.fn() } as any, {} as any);
  });
  afterAll(() => {
    if (originalNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNode;
    if (originalFlag === undefined) delete process.env.ENABLE_DEMO_LOGIN; else process.env.ENABLE_DEMO_LOGIN = originalFlag;
  });
  it('requires explicit hosted opt-in', () => {
    for (const flag of [undefined, '', 'false']) {
      if (flag === undefined) delete process.env.ENABLE_DEMO_LOGIN; else process.env.ENABLE_DEMO_LOGIN = flag;
      expect(service.personas()).toEqual({ enabled: false, personas: [] });
    }
  });
  it('offers shopper, lender and affiliate fixtures without staff or credentials', () => {
    const result = service.personas();
    expect(result.enabled).toBe(true); expect(result.personas).toHaveLength(8);
    expect(result.personas.every(p => p.app === 'web')).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/@|password|emails/);
  });
  it('rejects staff and unknown personas before any account lookup', async () => {
    for (const key of ['staff-superadmin', 'staff-ops', 'unknown']) await expect(service.login(key)).rejects.toThrow('Unknown demo account');
    expect(db.query.users.findMany).not.toHaveBeenCalled();
  });
  it('issues a session only for the expected existing sample account', async () => {
    const result = await service.login('shopper-salaried');
    expect(result.user.email).toBe('naledi@example.com'); expect(result.user.passwordHash).toBeUndefined();
    expect(auth.issueTokens).toHaveBeenCalledWith(rows[0]);
  });
  it('never prepares hosted data when a fixture is missing', async () => {
    rows = []; const build = jest.spyOn(service as any, 'ensureDemoData');
    await expect(service.login('shopper-salaried')).rejects.toThrow('sample account is unavailable');
    expect(build).not.toHaveBeenCalled(); expect(auth.issueTokens).not.toHaveBeenCalled();
  });
  it('rejects suspended, privileged and wrong-role sample records', async () => {
    for (const overrides of [{ status: 'SUSPENDED' }, { roles: ['CONSUMER', 'SUPER_ADMIN'] }, { roles: ['LENDER'] }]) {
      rows = [{ id: 'sample-only', email: 'naledi@example.com', roles: ['CONSUMER'], status: 'ACTIVE', ...overrides }];
      await expect(service.login('shopper-salaried')).rejects.toThrow();
    }
    expect(auth.issueTokens).not.toHaveBeenCalled();
  });
});
