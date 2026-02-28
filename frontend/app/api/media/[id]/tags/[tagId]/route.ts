import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL ?? 'http://api:8000';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  const { id, tagId } = await params;
  const res = await fetch(`${BACKEND}/media/${id}/tags/${tagId}`, { method: 'DELETE' });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
