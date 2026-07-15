export type EnvVarVisibility = 'public' | 'server';
export type EnvVarRequirement = 'required' | 'optional';

export const PUBLIC_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_VERCEL_TOKEN_CONFIGURED',
] as const;

export const SERVER_ENV_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'PERPLEXITY_API_KEY',
  'VERCEL_TOKEN',
] as const;

export type PublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number];
export type ServerEnvKey = (typeof SERVER_ENV_KEYS)[number];
export type KnownEnvKey = PublicEnvKey | ServerEnvKey;

export interface EnvVarSpec {
  key: KnownEnvKey;
  visibility: EnvVarVisibility;
  requirement: EnvVarRequirement;
  description: string;
}

export interface EnvValidationIssue {
  key: KnownEnvKey;
  visibility: EnvVarVisibility;
  requirement: EnvVarRequirement;
  message: string;
}

export interface EnvValidationResult {
  ok: boolean;
  issues: EnvValidationIssue[];
}

const PUBLIC_ENV_KEY_SET = new Set<string>(PUBLIC_ENV_KEYS);
const SERVER_ENV_KEY_SET = new Set<string>(SERVER_ENV_KEYS);

// Public values must be statically referenced so Next.js can embed them
// into browser bundles. Do not replace these with process.env[key].
export const PUBLIC_ENV_MAP: Readonly<Record<PublicEnvKey, string | undefined>> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_VERCEL_TOKEN_CONFIGURED:
    process.env.NEXT_PUBLIC_VERCEL_TOKEN_CONFIGURED,
};

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

function readEnvValue(
  key: string,
  source: Record<string, string | undefined>
): string | undefined {
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
  key: ServerEnvKey,
  source: Record<string, string | undefined> = process.env
): string | undefined {
  if (!SERVER_ENV_KEY_SET.has(key)) {
    throw new Error(`${key} is public; use getPublicEnv instead.`);
  }
  if (typeof window !== 'undefined') {
    throw new Error(`${key} is server-only and cannot be read in the browser.`);
  }
  return readEnvValue(key, source);
}

export function requireServerEnv(
  key: ServerEnvKey,
  source: Record<string, string | undefined> = process.env
): string {
  const value = getOptionalServerEnv(key, source);
  if (!value) {
    throw new Error(`${key} is not configured.`);
  }
  return value;
}

export function getPublicEnv(
  key: PublicEnvKey,
  source?: Record<string, string | undefined>
): string | undefined {
  if (!PUBLIC_ENV_KEY_SET.has(key)) {
    throw new Error(`${key} is server-only and must not be exposed to the browser.`);
  }
  return readEnvValue(key, source ?? PUBLIC_ENV_MAP);
}