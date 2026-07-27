import { NextResponse } from 'next/server';
import { getConfigurationHealth } from '@/lib/operations/health';

export async function GET() {
  const health = getConfigurationHealth();
  return NextResponse.json({
    status: health.supabase === 'configured' && health.openai === 'configured' ? 'ready' : 'degraded',
  });
}
