import { NextResponse } from 'next/server';
import type { AdvisorData } from '@/lib/advisor-data';
import { mockData } from '@/lib/mock-data';
import { isPersonaId } from '@/lib/personas';
import { isSnowflakeConfigured } from '@/lib/snowflake';

// One entry point for every screen. Uses Snowflake when .env.local is configured, otherwise
// the bundled synthetic data. Live failures are returned as errors, never silently replaced
// with sample data, so a live screen never shows mock numbers.
const OPS = new Set<keyof AdvisorData>(['book', 'household', 'explain', 'agenda', 'coach', 'recordAction', 'log', 'traces']);

export async function POST(request: Request) {
  const { op, args } = await request.json();
  if (!OPS.has(op) || !Array.isArray(args)) return NextResponse.json({ error: 'Unknown operation' }, { status: 400 });
  if (op !== 'log' && op !== 'traces' && !isPersonaId(args[0])) return NextResponse.json({ error: 'Unknown persona' }, { status: 400 });

  const impl: AdvisorData = isSnowflakeConfigured() ? (await import('@/lib/live-data')).liveData : mockData;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (impl[op as keyof AdvisorData] as (...a: any[]) => Promise<unknown>)(...args);
    return NextResponse.json(result ?? { notFound: true });
  } catch (error) {
    console.error(`${op} failed:`, error);
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 502 });
  }
}
