/**
 * Public surface of the dependency awareness subsystem (Phase 2).
 *
 * Only this module should be imported by feature code (ChatComposer,
 * auto-fix loop, etc.).
 */

export {
  analyzeAndAddMissingDependencies,
  type DependencyAnalysisResult,
  type AnalyzeOptions,
} from './resolver';

export {
  scanProjectImports,
  scanFileImports,
  specifierToPackageName,
  type ImportRef,
} from './scanner';

export {
  pickVersionFor,
  isLikelyDevDep,
  KNOWN_PACKAGES,
} from './registry';

export {
  parsePackageJson,
  stringifyPackageJson,
  addDependencies,
  findPackageJsonNode,
  type PackageJsonShape,
  type ParsedPackageJson,
  type AddDepResult,
} from './packageJson';
