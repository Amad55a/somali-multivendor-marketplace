import { dispatchApiRequest } from "@/lib/api/v1";

type RouteContext = { params: Promise<{ segments: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  const { segments } = await context.params;
  return dispatchApiRequest(request, segments);
}

export async function POST(request: Request, context: RouteContext) {
  const { segments } = await context.params;
  return dispatchApiRequest(request, segments);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { segments } = await context.params;
  return dispatchApiRequest(request, segments);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { segments } = await context.params;
  return dispatchApiRequest(request, segments);
}
