import { NextResponse } from 'next/server';
import { isSnowflakeConfigured } from '@/lib/snowflake';

// Tells the UI which data source the server uses, so the header can show Live or Sample mode.
export function GET() {
  return NextResponse.json({ mode: isSnowflakeConfigured() ? 'live' : 'sample' });
}
