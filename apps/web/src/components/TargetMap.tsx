'use client';
import { useEffect } from 'react';
import { Circle, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LocationTarget } from '@xtra/shared';
import 'leaflet/dist/leaflet.css';
function Pin({ value, onChange }: { value: LocationTarget; onChange: (value: LocationTarget) => void }) {
  const map = useMap();
  useEffect(() => { map.setView([value.latitude, value.longitude], map.getZoom()); }, [map, value.latitude, value.longitude]);
  useMapEvents({ click: e => onChange({ ...value, latitude: e.latlng.lat, longitude: e.latlng.lng, label: 'Selected map pin', placeId: undefined }) });
  return <><Circle center={[value.latitude, value.longitude]} radius={value.radiusMeters} pathOptions={{ color: '#5C2394', fillOpacity: 0.15 }} /><Circle center={[value.latitude, value.longitude]} radius={8} pathOptions={{ color: '#5C2394', fillOpacity: 1 }} /><button type="button" className="absolute right-3 top-3 z-[1000] rounded-lg bg-white px-3 py-2 text-xs font-semibold text-brand-purple shadow" onClick={e => { e.stopPropagation(); const center = map.getCenter(); onChange({ ...value, latitude: center.lat, longitude: center.lng, label: 'Selected map pin', placeId: undefined }); }}>Use map centre</button></>;
}
export default function TargetMap({ value, onChange }: { value: LocationTarget; onChange: (value: LocationTarget) => void }) {
  return <MapContainer center={[value.latitude, value.longitude]} zoom={15} scrollWheelZoom={false} className="z-0 h-64 w-full rounded-xl" aria-label="Offer target map"><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" /><Pin value={value} onChange={onChange} /></MapContainer>;
}
