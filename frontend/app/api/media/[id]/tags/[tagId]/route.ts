import { NextRequest, NextResponse } from 'next/server';
import { withBackend } from '@/lib/route-backend';

export const DELETE = withBackend(async (
  backend,
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) => {
  const { id, tagId } = await params;
  const res = await fetch(`${backend}/media/${id}/tags/${tagId}`, { method: 'DELETE' });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
});
