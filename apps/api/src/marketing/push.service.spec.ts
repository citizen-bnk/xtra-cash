import { PushService } from './push.service';
import * as webpush from 'web-push';
jest.mock('web-push', () => ({ sendNotification: jest.fn() }));
describe('push provider reporting', () => {
  const before = { ...process.env };
  afterEach(() => { process.env = { ...before }; jest.restoreAllMocks(); jest.clearAllMocks(); });
  it('does not report delivery when the provider is not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
    expect(await new PushService().send('WEB', {}, 'test')).toEqual({ status: 'UNAVAILABLE' });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
  it('uses neutral content, short expiry and records browser provider acceptance', async () => {
    process.env.VAPID_PUBLIC_KEY = 'test-public'; process.env.VAPID_PRIVATE_KEY = 'test-private';
    (webpush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
    expect(await new PushService().send('WEB', { endpoint: 'test' }, 'campaign')).toEqual({ status: 'ACCEPTED' });
    const [, content, options] = (webpush.sendNotification as jest.Mock).mock.calls[0];
    expect(JSON.parse(content).url).toBe('/offers/campaign'); expect(options.TTL).toBe(120);
    expect(JSON.parse(content).body).not.toMatch(/approved|pre-approved/i);
  });
  it('expires rejected browser devices without retrying', async () => {
    process.env.VAPID_PUBLIC_KEY = 'test-public'; process.env.VAPID_PRIVATE_KEY = 'test-private';
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 });
    expect(await new PushService().send('WEB', {}, 'test')).toEqual({ status: 'EXPIRED' });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });
  it('records Expo tickets rather than claiming the member saw the notification', async () => {
    process.env.ENABLE_EXPO_PUSH = 'true';
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ data: { status: 'ok', id: 'isolated-ticket' } }) } as Response);
    expect(await new PushService().send('EXPO', { token: 'test' }, 'campaign')).toEqual({ status: 'ACCEPTED', ticketId: 'isolated-ticket' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
