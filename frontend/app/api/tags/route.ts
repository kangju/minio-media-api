import { NextRequest, NextResponse } from 'next/server';
import { withBackend } from '@/lib/route-backend';

export const GET = withBackend(async (backend) => {
  const res = await fetch(`${backend}/tags`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
});

export const POST = withBackend(async (backend, req: NextRequest) => {
  const body = await req.json();
  const res = await fetch(`${backend}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
});
