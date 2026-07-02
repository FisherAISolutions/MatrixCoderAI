import { NextRequest, NextResponse } from 'next/server';
import {
  runVercelServerAction,
  type VercelServerActionRequest,
} from '@/lib/deployment/vercelServerActions';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VercelServerActionRequest;
    const result = await runVercelServerAction(body);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        action: 'test-connection',
        error:
          error instanceof Error
            ? error.message
            : 'Vercel deployment request failed.',
      },
      { status: 400 }
    );
  }
}
