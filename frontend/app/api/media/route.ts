import { NextRequest, NextResponse } from 'next/server';
import { withBackend } from '@/lib/route-backend';

export const GET = withBackend(async (backend, req: NextRequest) => {
  const url = new URL(req.url);
  const res = await fetch(`${backend}/media${url.search}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
});

export const POST = withBackend(async (backend, req: NextRequest) => {
  const formData = await req.formData();
  const res = await fetch(`${backend}/media`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
});
