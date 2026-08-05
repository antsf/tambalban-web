import type { Workshop, WorkshopSubmission } from "@/types";

export function formatHours(
  item: Pick<Workshop | WorkshopSubmission, "is_24h" | "open_time" | "close_time">,
): string {
  if (item.is_24h) return "Buka 24 jam";
  if (item.open_time && item.close_time) {
    return `${item.open_time} – ${item.close_time}`;
  }
  return "Jam buka tidak diketahui";
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Digits-only phone for `tel:` and WhatsApp links. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
