"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const dragIcon = L.divIcon({
  className: "",
  html: `<span style="display:block;width:26px;height:26px;background:#E4002B;border:3px solid #111;box-shadow:4px 4px 0 0 #111;cursor:grab"></span>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

function ClickToMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onMove(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

/** Recenters when the parent sets coordinates from search or geolocation. */
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 16));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return null;
}

type Props = {
  latitude: number;
  longitude: number;
  onChange: (lat: number, lng: number) => void;
};

export function LocationPicker({ latitude, longitude, onChange }: Props) {
  const handlers = useMemo(
    () => ({
      dragend(event: L.DragEndEvent) {
        const { lat, lng } = (event.target as L.Marker).getLatLng();
        onChange(lat, lng);
      },
    }),
    [onChange],
  );

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={16}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Recenter lat={latitude} lng={longitude} />
      <ClickToMove onMove={onChange} />
      <Marker
        position={[latitude, longitude]}
        icon={dragIcon}
        draggable
        eventHandlers={handlers}
      />
    </MapContainer>
  );
}
