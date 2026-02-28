import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL ?? 'http://api:8000';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const res = await fetch(`${BACKEND}/media${url.search}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const res = await fetch(`${BACKEND}/media`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
