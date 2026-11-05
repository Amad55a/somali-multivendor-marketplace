import { generateOpenApiDocument } from "@/lib/api/v1";

export async function GET() {
  return Response.json(generateOpenApiDocument(), {
    headers: { "Cache-Control": "no-store" },
  });
}
