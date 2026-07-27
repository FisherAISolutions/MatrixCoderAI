export type KillSwitch =
  | 'ai'
  | 'task-builds'
  | 'deployment'
  | 'checkout';

const ENV_BY_SWITCH: Record<KillSwitch, string> = {
  ai: 'MATRIX_DISABLE_AI',
  'task-builds': 'MATRIX_DISABLE_TASK_BUILDS',
  deployment: 'MATRIX_DISABLE_DEPLOYMENT',
  checkout: 'MATRIX_DISABLE_CHECKOUT',
};

function isTruthy(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? '');
}

export function isKillSwitchActive(
  name: KillSwitch,
  source: Record<string, string | undefined> = process.env
): boolean {
  return isTruthy(source[ENV_BY_SWITCH[name]]);
}

export function assertKillSwitchOpen(
  name: KillSwitch,
  source?: Record<string, string | undefined>
): void {
  if (isKillSwitchActive(name, source)) {
    throw new Error(`${name} is temporarily unavailable by operator policy.`);
  }
}
