/**
 * Public surface of the validation + auto-fix subsystem.
 *
 * Phase 1 — Build Validation + Auto-Fix Loop.
 *
 * Only this module should be imported from feature code (ChatComposer,
 * ChatWorkspacePage, etc.). Internals live under `./engine`, `./autoFixLoop`,
 * `./autoFixPrompt`, `./errorParser`.
 */

export {
  runValidation,
  type ValidationResult,
  type ValidationOptions,
  type StepResult,
  type ValidationStep,
  type ParsedError,
} from './engine';

export {
  runAutoFixLoop,
  isAutoFixRunning,
  AUTO_FIX_ENABLED,
  AUTO_FIX_MAX_ATTEMPTS,
  type AutoFixLoopOptions,
  type AutoFixLoopResult,
  type ChatSystemMessage,
} from './autoFixLoop';

export {
  detectWebContainerSupport,
  type SupportInfo,
} from '@/lib/webcontainer/manager';
