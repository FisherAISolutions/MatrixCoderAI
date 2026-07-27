import { getOptionalServerEnv, getPublicEnv } from '@/lib/env';
import { stripeConfigurationStatus } from '@/lib/billing/serverActions';

export interface ConfigurationHealth {
  app: 'ready';
  supabase: 'configured' | 'missing';
  openai: 'configured' | 'missing';
  stripe: 'configured' | 'partial' | 'missing';
  vercel: 'configured' | 'missing';
  errorReporting: 'configured' | 'missing';
}

export function getConfigurationHealth(): ConfigurationHealth {
  const stripe = stripeConfigurationStatus();
  const stripeValues = Object.values(stripe);
  return {
    app: 'ready',
    supabase:
      getPublicEnv('NEXT_PUBLIC_SUPABASE_URL') &&
      getPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
        ? 'configured'
        : 'missing',
    openai: getOptionalServerEnv('OPENAI_API_KEY') ? 'configured' : 'missing',
    stripe: stripeValues.every(Boolean)
      ? 'configured'
      : stripeValues.some(Boolean)
        ? 'partial'
        : 'missing',
    vercel: getOptionalServerEnv('VERCEL_TOKEN') ? 'configured' : 'missing',
    errorReporting: getOptionalServerEnv('MATRIX_ERROR_REPORTING_URL')
      ? 'configured'
      : 'missing',
  };
}
