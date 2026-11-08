import { describe, expect, it } from "vitest";
import {
  createLocationAttachment,
  locationAttachmentSchema,
  locationCoordinatesSchema,
} from "../../src/features/communications/location";

describe("conversation location sharing", () => {
  it("builds a rounded OpenStreetMap location card", () => {
    const attachment = createLocationAttachment({
      latitude: 2.046713,
      longitude: 45.318161,
    });

    expect(attachment).toEqual({
      kind: "LOCATION",
      latitude: 2.0467,
      longitude: 45.3182,
      mapUrl: "https://www.openstreetmap.org/?mlat=2.0467&mlon=45.3182#map=16/2.0467/45.3182",
    });
    expect(locationAttachmentSchema.safeParse(attachment).success).toBe(true);
  });

  it("rejects coordinates outside geographic bounds", () => {
    expect(locationCoordinatesSchema.safeParse({ latitude: 91, longitude: 45 }).success).toBe(false);
    expect(locationCoordinatesSchema.safeParse({ latitude: 2, longitude: 181 }).success).toBe(false);
  });
});
