function accountAlertUrl(value) {
  try {
    const url = new URL(value);
    const allowedOrigin = [self.location.origin, 'https://xtra-cash.vercel.app', 'https://xtra-cash-admin.vercel.app'].includes(url.origin);
    if (allowedOrigin && /^\/(?:app\/(?:applications\/[A-Za-z0-9-]+|pay)|lender\/applications\/[A-Za-z0-9-]+|applications\/[A-Za-z0-9-]+|money)$/.test(url.pathname)) return url.href;
  } catch {}
}
self.addEventListener('push', event => {
  let data; try { data = event.data.json(); } catch { return; }
  if (data?.type === 'ACCOUNT_ACTIVITY' && accountAlertUrl(data.url)) {
    event.waitUntil(self.registration.showNotification('XTRA-CASH account update', {
      body: 'Open XTRA-CASH to view your update.', icon: '/icons/icon-192.png',
      tag: 'account-' + data.notificationId, data: { accountUrl: data.url },
    }));
    return;
  }
  if (!data || !/^[a-f0-9-]{36}$/i.test(data.campaignId || '')) return;
  event.waitUntil(self.registration.showNotification('A nearby offer is available', { body: 'View the offer in XTRA-CASH. Eligibility checks and lender approval apply.', icon: '/icons/icon-192.png', tag: `offer-${data.campaignId}`, data: { url: `/offers/${data.campaignId}` } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const accountUrl = accountAlertUrl(event.notification.data?.accountUrl);
  if (accountUrl) { event.waitUntil(clients.openWindow(accountUrl)); return; }
  const path = event.notification.data?.url;
  if (!/^\/offers\/[a-f0-9-]{36}$/i.test(path || '')) return;
  event.waitUntil(clients.openWindow(new URL(path, self.location.origin).href));
});
