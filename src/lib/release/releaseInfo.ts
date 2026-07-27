import packageJson from '../../../package.json';

export const MATRIX_RELEASE = {
  channel: 'Private beta',
  version: packageJson.version,
} as const;
