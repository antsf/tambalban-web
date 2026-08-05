import { getWorkshopsInBounds, searchWorkshopsByName } from "@/lib/geo";
import { boundsSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const query = params.get("q")?.trim();
  if (query) {
    if (query.length < 3) {
      return Response.json(
        { error: "Kata kunci minimal 3 karakter" },
        { status: 400 },
      );
    }
    const results = await searchWorkshopsByName(query);
    return Response.json({ workshops: results });
  }

  const parsed = boundsSchema.safeParse({
    north: params.get("north"),
    south: params.get("south"),
    east: params.get("east"),
    west: params.get("west"),
  });

  if (!parsed.success) {
    return Response.json(
      { error: "Bounds tidak valid", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const workshops = await getWorkshopsInBounds(parsed.data);
  return Response.json({ workshops });
}
