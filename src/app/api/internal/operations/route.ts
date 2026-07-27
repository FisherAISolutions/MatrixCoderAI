import { NextResponse } from 'next/server';
import { authenticateServerRequest } from '@/lib/auth/serverAuth';
import { getRecentOperationEvents } from '@/lib/operations/events';
import { getConfigurationHealth } from '@/lib/operations/health';

export async function GET(request: Request) {
  try {
    const user = await authenticateServerRequest(request);
    if (!user.isInternal) {
      return NextResponse.json({ error: 'Internal operator access required.' }, { status: 403 });
    }
    const events = getRecentOperationEvents(100);
    const failures = events.filter((event) => event.status === 'failed');
    return NextResponse.json({
      health: getConfigurationHealth(),
      summary: {
        recentOperations: events.length,
        failures: failures.length,
        deploymentFailures: failures.filter((event) => event.domain === 'deployment').length,
        billingFailures: failures.filter((event) => event.domain === 'billing').length,
        providerFailures: failures.filter((event) =>
          event.failureCategory?.startsWith('provider-')
        ).length,
      },
      events,
    });
  } catch {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
}
