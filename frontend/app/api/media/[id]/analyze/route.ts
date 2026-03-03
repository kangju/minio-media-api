import { NextRequest, NextResponse } from 'next/server';
import { withBackend } from '@/lib/route-backend';

export const POST = withBackend(async (
  backend,
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const body = await req.text();
  const res = await fetch(`${backend}/media/${id}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
});
