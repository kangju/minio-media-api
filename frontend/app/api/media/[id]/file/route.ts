import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL ?? 'http://api:8000';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await fetch(`${BACKEND}/media/${id}/file`);
  return new NextResponse(res.body, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
    },
    status: res.status,
  });
}
