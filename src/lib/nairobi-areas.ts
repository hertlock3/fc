/**
 * Curated Nairobi delivery areas with approximate coordinates.
 *
 * Formal addressing is inconsistent across Nairobi, so we let customers pick
 * their estate/area (which resolves to a coordinate) and optionally refine the
 * pin. This keeps the distance/delivery-fee calculation reliable without
 * requiring a paid geocoding API.
 */
export interface DeliveryArea {
  name: string;
  lat: number;
  lng: number;
  /** Rough zone used for display grouping. */
  zone: "Central" | "North" | "East" | "West" | "South" | "Satellite";
}

export const NAIROBI_AREAS: DeliveryArea[] = [
  { name: "Nairobi CBD", lat: -1.2864, lng: 36.8172, zone: "Central" },
  { name: "Parklands", lat: -1.2635, lng: 36.8260, zone: "Central" },
  { name: "Westlands", lat: -1.2670, lng: 36.8070, zone: "Central" },
  { name: "Kilimani", lat: -1.2921, lng: 36.7835, zone: "Central" },
  { name: "Lavington", lat: -1.2760, lng: 36.7680, zone: "West" },
  { name: "Kileleshwa", lat: -1.2830, lng: 36.7820, zone: "West" },
  { name: "Karen", lat: -1.3190, lng: 36.7070, zone: "West" },
  { name: "Ngong Road", lat: -1.2985, lng: 36.7750, zone: "West" },
  { name: "Kahawa West", lat: -1.2250, lng: 36.9060, zone: "North" },
  { name: "Kasarani", lat: -1.2280, lng: 36.8970, zone: "North" },
  { name: "Roysambu", lat: -1.2190, lng: 36.8870, zone: "North" },
  { name: "Zimmerman", lat: -1.2130, lng: 36.8840, zone: "North" },
  { name: "Muthaiga", lat: -1.2400, lng: 36.8420, zone: "North" },
  { name: "Runda", lat: -1.2170, lng: 36.8300, zone: "North" },
  { name: "Eastleigh", lat: -1.2740, lng: 36.8490, zone: "East" },
  { name: "Buruburu", lat: -1.2870, lng: 36.8740, zone: "East" },
  { name: "Donholm", lat: -1.3030, lng: 36.8870, zone: "East" },
  { name: "Umoja", lat: -1.2860, lng: 36.8950, zone: "East" },
  { name: "Embakasi", lat: -1.3230, lng: 36.8950, zone: "East" },
  { name: "South B", lat: -1.3110, lng: 36.8360, zone: "South" },
  { name: "South C", lat: -1.3230, lng: 36.8260, zone: "South" },
  { name: "Langata", lat: -1.3450, lng: 36.7600, zone: "South" },
  { name: "Rongai", lat: -1.3960, lng: 36.7450, zone: "Satellite" },
  { name: "Kitengela", lat: -1.5170, lng: 36.9560, zone: "Satellite" },
  { name: "Ruiru", lat: -1.1470, lng: 36.9600, zone: "Satellite" },
  { name: "Kiambu", lat: -1.1710, lng: 36.8350, zone: "Satellite" },
];

/** Find an area by its exact name. */
export function findArea(name: string): DeliveryArea | undefined {
  return NAIROBI_AREAS.find((a) => a.name.toLowerCase() === name.toLowerCase());
}
