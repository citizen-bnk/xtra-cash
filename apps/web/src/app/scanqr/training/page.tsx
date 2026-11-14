import { QRCodeSVG } from 'qrcode.react';

const restaurants = [
  { code: '123ABC', name: 'Casa Bella' },
  { code: '234BCD', name: 'Doppio Zero' },
  { code: '345CDE', name: 'Ocean Basket' },
  { code: '456DEF', name: 'RocoMamas' },
];

export const metadata = {
  title: 'Waterfall restaurant QR training',
  robots: { index: false, follow: false },
};

export default function RestaurantQrTraining() {
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6">
      <h1 className="text-3xl font-bold">Waterfall restaurant QR training</h1>
      <p>Scan a code from another device or open the checkout link on this device. Use a sample receipt. These training records use real branch names. They do not represent onboarded restaurants and cannot accept payments.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {restaurants.map(({ code, name }) => {
          const url = `https://xtra-cash.vercel.app/scanqr?code=${code}`;
          return (
            <section key={code} className="grid justify-items-center gap-3 rounded-2xl border border-purple-100 bg-white p-5 text-center text-slate-900">
              <h2 className="font-bold">{name} · Mall of Africa</h2>
              <QRCodeSVG value={url} size={192} marginSize={4} title={`Checkout QR for ${name}`} />
              <strong className="font-mono tracking-widest">{code}</strong>
              <a href={url} className="font-semibold text-purple-800 underline">Open test checkout</a>
            </section>
          );
        })}
      </div>
    </main>
  );
}
