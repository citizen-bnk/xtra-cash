"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useApi, useAuth } from "./api";
import {
  Alert,
  Button,
  Card,
  Modal,
} from "./components";
import {
  PersonalSettlementView,
  WalletTransferView,
} from "./personal-settlement";
type Notification = {
  key: string;
  applicationId: string;
  title: string;
  description: string;
  cta: string;
  kind: string;
  owner: string;
  read: boolean;
};
type RestaurantNotification = { id: string; kind: 'BILL_FUNDED' | 'BILL_SETTLED'; created_at: string; read_at: string | null; share_token: string; merchant_name: string; bill_reference: string };
export function LoanActionCentre({ variant = "default" }: { variant?: "default" | "immersive" }) {
  const { client, me } = useAuth(),
    data = useApi(
      (c) =>
        c.request<{ notifications: Notification[]; delivery: string }>(
          "GET",
          "/loan-operations/notifications",
        ),
      [me?.id],
    );
  const restaurant = useApi((c) => me?.roles.includes('CONSUMER') ? c.request<RestaurantNotification[]>('GET', '/me/restaurant-notifications') : Promise.resolve([]), [me?.id]);
  const [bellOpen, setBellOpen] = useState(false),
    [active, setActive] = useState<Notification | null>(null),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") { data.reload(); restaurant.reload(); }
    }, 30000);
    const refresh = () => { data.reload(); restaurant.reload(); };
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [data.reload, restaurant.reload]);
  const reviewer = !!me?.roles.some(
      (r) => r === "ADMIN" || r === "SUPER_ADMIN" || r === "LENDER",
    ),
    unreadLoans = data.data?.notifications.filter((n) => !n.read).length ?? 0,
    unreadRestaurant = restaurant.data?.filter((n) => !n.read_at).length ?? 0,
    unread = unreadLoans + unreadRestaurant;
  async function act(n: Notification) {
    setActive(n);
    try {
      await client.request("POST", "/loan-operations/notifications/read", {
        key: n.key,
      });
      data.reload();
      if (n.kind === 'VAULT') { window.location.assign('/app/data-vault'); return; }
    } catch {
      setNotice(
        "The task may have changed. Refresh notifications before acting.",
      );
    }
  }
  return (
    <section
      className="inline-flex"
      aria-label="Loan tasks and notifications"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="hidden">
          <h2 className="font-bold">Your next actions</h2>
          <p className="text-sm text-muted">
            {data.data?.notifications.length
              ? `${data.data.notifications.length} current tasks · ${unread} unread`
              : "No loan action is waiting for you."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            title="Notifications"
            onClick={() => {
              setBellOpen(true);
              data.reload();
              restaurant.reload();
            }}
            className={`relative grid h-10 w-10 place-items-center rounded-xl border focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${variant === "immersive" ? "border-white/20 bg-white/10 text-white hover:bg-white/20" : "border-line bg-white text-ink hover:bg-surface focus-visible:ring-brand-purple/60"}`}
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-brand px-1 text-center text-[11px] font-bold leading-5 text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        </div>
      </div>
      <Modal
        open={bellOpen}
        title={unread ? `Unread notifications (${unread})` : "Notifications"}
        onClose={() => {
          setBellOpen(false);
          data.reload();
          restaurant.reload();
        }}
      >
        {data.error && <Alert tone="red">{data.error}</Alert>}
        {restaurant.error && me?.roles.includes('CONSUMER') && <Alert tone="amber">Restaurant notifications are temporarily unavailable.</Alert>}
        {notice && <Alert tone="amber">{notice}</Alert>}
        {unread ? (
          <div className="space-y-3">
            {data.data?.notifications.filter((n) => !n.read).map((n) => (
              <Card key={n.key} className="border-brand/30">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong>{n.title}</strong>
                    <p className="mt-1 text-sm text-muted">{n.description}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-brand-soft px-2 py-1 text-xs font-semibold">Unread</span>
                </div>
                <Button className="mt-3" onClick={() => { setBellOpen(false); void act(n); }}>
                  {n.cta || "Open task"}
                </Button>
              </Card>
            ))}
            {restaurant.data?.filter((n) => !n.read_at).map((n) => <Card key={n.id} className="border-brand/30"><strong>{n.kind === 'BILL_FUNDED' ? 'Everyone has funded the table bill' : 'Restaurant bill settled'}</strong><p className="mt-1 text-sm text-muted">{n.merchant_name} · {n.bill_reference}. View your paid items and receipt.</p><Button className="mt-3" onClick={() => { setBellOpen(false); void client.request('POST', `/me/restaurant-notifications/${n.id}/read`, {}).finally(() => window.location.assign(`/scanqr/?table=${n.share_token}`)); }}>Open shared bill</Button></Card>)}
          </div>
        ) : (
          <p className="text-sm text-muted">You’re all caught up. New loan tasks will appear here with an action button.</p>
        )}
      </Modal>
      <Modal
        open={!!active}
        title={active?.title ?? "Loan task"}
        onClose={() => {
          setActive(null);
          data.reload();
        }}
      >
        {active?.kind === "WALLET" ? (
          <WalletTransferView />
        ) : (
          active && (
            <PersonalSettlementView
              key={active.applicationId}
              applicationId={active.applicationId}
              reviewer={reviewer}
            />
          )
        )}
      </Modal>
    </section>
  );
}
