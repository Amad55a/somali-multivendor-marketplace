import { z } from "zod";

export const locationCoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
}).strict();
export const locationAttachmentSchema = z.object({
  kind: z.literal("LOCATION"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  mapUrl: z.url(),
}).strict();

export type LocationCoordinates = z.infer<typeof locationCoordinatesSchema>;

export function createLocationAttachment(coordinates: LocationCoordinates) {
  const latitude = Number(coordinates.latitude.toFixed(4));
  const longitude = Number(coordinates.longitude.toFixed(4));
  const query = new URLSearchParams({
    mlat: latitude.toString(),
    mlon: longitude.toString(),
  });
  return {
    kind: "LOCATION",
    latitude,
    longitude,
    mapUrl: `https://www.openstreetmap.org/?${query.toString()}#map=16/${latitude}/${longitude}`,
  };
}
