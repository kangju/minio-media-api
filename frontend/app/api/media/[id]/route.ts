import { NextRequest, NextResponse } from 'next/server';
import { withBackend } from '@/lib/route-backend';

export const GET = withBackend(async (
  backend,
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const res = await fetch(`${backend}/media/${id}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
});

export const DELETE = withBackend(async (
  backend,
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const res = await fetch(`${backend}/media/${id}`, { method: 'DELETE' });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
});
