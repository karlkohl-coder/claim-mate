import data from "./data/airports.json";

/*
 * Flughafen-Koordinaten für die Flugstrecke.
 * Quelle: OurAirports (Public Domain). Enthalten sind Flughäfen mit IATA-Code und Linienflügen.
 */

export type Airport = { iata: string; lat: number; lon: number; country: string; city: string };

const airports = data.airports as unknown as Record<string, [number, number, string, string]>;

export function findAirport(code: string): Airport | undefined {
  const iata = code.trim().toUpperCase();
  const entry = airports[iata];
  if (!entry) return undefined;
  const [lat, lon, country, city] = entry;
  return { iata, lat, lon, country, city };
}

/** Großkreis-Entfernung in km (Haversine), auf ganze km gerundet. */
export function distanceKm(a: Pick<Airport, "lat" | "lon">, b: Pick<Airport, "lat" | "lon">): number {
  const R = 6371;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
