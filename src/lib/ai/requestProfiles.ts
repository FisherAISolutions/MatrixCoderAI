export const CHAT_REQUEST_PROFILES = {
  generation: {
    max_completion_tokens: 8192,
  },
  autoFix: {
    max_completion_tokens: 8192,
  },
  engineeringTask: {
    temperature: 0.2,
  },
  targetedRepair: {
    temperature: 0.1,
  },
  liveBenchmark: {
    temperature: 0.2,
  },
  styleInspiration: {
    max_tokens: 3000,
  },
} as const;

