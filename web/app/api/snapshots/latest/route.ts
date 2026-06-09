// web/app/api/snapshots/latest/route.ts
import { NextResponse } from 'next/server';
import { getLatestSnapshot } from '@/lib/snapshot.server';

export const revalidate = 0;

export async function GET(): Promise<Response> {
  try {
    const payload = await getLatestSnapshot();
    return NextResponse.json(payload, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
