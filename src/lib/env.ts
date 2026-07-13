export type EnvVarVisibility = 'public' | 'server';
export type EnvVarRequirement = 'required' | 'optional';

export interface EnvVarSpec {
  key: string;
  visibility: EnvVarVisibility;
  requirement: EnvVarRequirement;
  description: string;
}

export interface EnvValidationIssue {
  key: string;
  visibility: EnvVarVisibility;
  requirement: EnvVarRequirement;
  message: string;
}

export interface EnvValidationResult {
  ok: boolean;
  issues: EnvValidationIssue[];
}

export const ENV_SPECS = [
  {
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    visibility: 'public',
    requirement: 'optional',
    description: 'Supabase project URL used by browser auth and optional persistence.',
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    visibility: 'public',
    requirement: 'optional',
    description: 'Supabase anon key used by browser auth and optional persistence.',
  },
  {
    key: 'OPENAI_API_KEY',
    visibility: 'server',
    requirement: 'required',
    description: 'Server-only key used by AI generation and embeddings API routes.',
  },
  {
    key: 'ANTHROPIC_API_KEY',
    visibility: 'server',
    requirement: 'optional',
    description: 'Reserved for future Anthropic provider support.',
  },
  {
    key: 'GEMINI_API_KEY',
    visibility: 'server',
    requirement: 'optional',
    description: 'Reserved for future Gemini provider support.',
  },
  {
    key: 'PERPLEXITY_API_KEY',
    visibility: 'server',
    requirement: 'optional',
    description: 'Reserved for future Perplexity provider support.',
  },
  {
    key: 'VERCEL_TOKEN',
    visibility: 'server',
    requirement: 'optional',
    description: 'Server-only Vercel token for guarded deployment actions.',
  },
  {
    key: 'NEXT_PUBLIC_VERCEL_TOKEN_CONFIGURED',
    visibility: 'public',
    requirement: 'optional',
    description: 'Boolean browser-safe flag indicating that Vercel is configured.',
  },
] as const satisfies readonly EnvVarSpec[];

export type KnownEnvKey = (typeof ENV_SPECS)[number]['key'];

function readEnvValue(key: string, source: Record<string, string | undefined> = process.env) {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function validateEnvironment(
  options: {
    source?: Record<string, string | undefined>;
    includeOptionalWarnings?: boolean;
    specs?: readonly EnvVarSpec[];
  } = {}
): EnvValidationResult {
  const source = options.source ?? process.env;
  const specs = options.specs ?? ENV_SPECS;
  const issues: EnvValidationIssue[] = [];

  for (const spec of specs) {
    const configured = !!readEnvValue(spec.key, source);
    if (!configured && spec.requirement === 'required') {
      issues.push({
        key: spec.key,
        visibility: spec.visibility,
        requirement: spec.requirement,
        message: `${spec.key} is required for production AI features.`,
      });
    } else if (!configured && options.includeOptionalWarnings) {
      issues.push({
        key: spec.key,
        visibility: spec.visibility,
        requirement: spec.requirement,
        message: `${spec.key} is optional but not configured.`,
      });
    }
  }

  return {
    ok: !issues.some((issue) => issue.requirement === 'required'),
    issues,
  };
}

export function getOptionalServerEnv(
  key: KnownEnvKey,
  source: Record<string, string | undefined> = process.env
): string | undefined {
  const spec = ENV_SPECS.find((item) => item.key === key);
  if (spec?.visibility === 'public') {
    throw new Error(`${key} is public; use getPublicEnv instead.`);
  }
  if (typeof window !== 'undefined') {
    throw new Error(`${key} is server-only and cannot be read in the browser.`);
  }
  return readEnvValue(key, source);
}

export function requireServerEnv(
  key: KnownEnvKey,
  source: Record<string, string | undefined> = process.env
): string {
  const value = getOptionalServerEnv(key, source);
  if (!value) {
    throw new Error(`${key} is not configured.`);
  }
  return value;
}

export function getPublicEnv(
  key: KnownEnvKey,
  source: Record<string, string | undefined> = process.env
): string | undefined {
  const spec = ENV_SPECS.find((item) => item.key === key);
  if (spec?.visibility === 'server') {
    throw new Error(`${key} is server-only and must not be exposed to the browser.`);
  }
  return readEnvValue(key, source);
}

