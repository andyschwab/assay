// app-router route handler: three methods, two declaration shapes
export async function GET(req: Request) {
  return Response.json({ ok: true });
}

export const PATCH = async (req: Request) => Response.json({ ok: true });

export function DELETE() {
  return new Response(null, { status: 204 });
}
