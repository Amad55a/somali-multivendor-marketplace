import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { generateOpenApiDocument } from "@/lib/api/v1";
import { GET as getOpenApiJson } from "@/app/api/openapi.json/route";

describe("OpenAPI contract", () => {
  it("documents implemented versioned routes, permissions, and cookie authentication", () => {
    const document = generateOpenApiDocument();
    const paths = document.paths ?? {};

    expect(document.openapi).toBe("3.0.3");
    expect(paths["/api/v1/auth/login"]?.post).toBeDefined();
    expect(paths["/api/v1/vendor/onboarding"]?.patch?.security).toEqual([
      { sessionCookie: [] },
    ]);
    expect(
      paths["/api/v1/admin/vendors/applications/{applicationId}/approve"]?.post
        ?.security,
    ).toEqual([{ sessionCookie: [] }]);
    expect(paths["/api/v1/admin/auth/login"]?.post?.security).toEqual([]);
    expect(
      paths["/api/v1/admin/vendors/applications/{applicationId}/approve"]?.post
        ?.parameters,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "applicationId", in: "path", required: true }),
      ]),
    );
    expect(JSON.stringify(document)).not.toContain("AUTH_SECRET");
    expect(JSON.stringify(document)).not.toContain("refreshToken");
  });

  it("groups routes under the requested tags and documents standard error envelopes", () => {
    const document = generateOpenApiDocument();
    const login = document.paths?.["/api/v1/auth/login"]?.post;

    expect(document.tags?.map((tag) => tag.name)).toEqual(
      expect.arrayContaining(["Authentication", "Customer", "Vendor Onboarding", "Admin"]),
    );
    expect(login?.responses["400"]).toBeDefined();
    expect(login?.responses["429"]).toBeDefined();
    expect(login?.requestBody).toBeDefined();
  });

  it("documents Amazon callback state and both supported start-request media types", () => {
    const document = generateOpenApiDocument();
    const amazonStart = document.paths?.["/api/v1/auth/amazon"]?.post;
    const amazonCallback = document.paths?.["/api/v1/auth/amazon/callback"]?.get;
    const requestContent =
      amazonStart?.requestBody && "content" in amazonStart.requestBody
        ? amazonStart.requestBody.content
        : {};

    expect(requestContent).toHaveProperty("application/json");
    expect(requestContent).toHaveProperty("application/x-www-form-urlencoded");
    expect(amazonCallback?.responses["303"]).toBeDefined();
    expect(amazonCallback?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "state", in: "query", required: true }),
      ]),
    );
  });

  it("serves a valid OpenAPI JSON document from the specification route", async () => {
    const response = await getOpenApiJson();
    const document = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(document.openapi).toBe("3.0.3");
    expect(document.paths["/api/v1/auth/amazon/callback"].get).toBeDefined();
  });
});
