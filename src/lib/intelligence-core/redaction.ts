import type {
  IntelligenceMemoryRecord,
  IntelligenceSensitivity,
  JsonValue,
} from './types';

const SECRET_KEY_PATTERN =
  /(api[_-]?key|token|password|secret|service[_-]?role|authorization|bearer|private[_-]?key)/i;
const SECRET_VALUE_PATTERN =
  /\b(sk-[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,})\b/g;
const DATA_IMAGE_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;
const LONG_BASE64_IMAGE_HINT = /^[A-Za-z0-9+/]{2000,}={0,2}$/;

function isPlainObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function inferSensitivityFromKeyValue(
  key: string,
  value: JsonValue
): IntelligenceSensitivity {
  if (SECRET_KEY_PATTERN.test(key)) return 'secret';
  if (
    typeof value === 'string' &&
    (SECRET_VALUE_PATTERN.test(value) || DATA_IMAGE_PATTERN.test(value))
  ) {
    SECRET_VALUE_PATTERN.lastIndex = 0;
    return DATA_IMAGE_PATTERN.test(value) ? 'raw-media' : 'secret';
  }
  if (typeof value === 'string' && LONG_BASE64_IMAGE_HINT.test(value)) {
    return 'raw-media';
  }
  return 'internal';
}

export function sanitizeIntelligenceValue(
  key: string,
  value: JsonValue
): JsonValue {
  if (typeof value === 'string') {
    if (SECRET_KEY_PATTERN.test(key) || SECRET_VALUE_PATTERN.test(value)) {
      SECRET_VALUE_PATTERN.lastIndex = 0;
      return value.replace(SECRET_VALUE_PATTERN, '[REDACTED_SECRET]');
    }
    if (DATA_IMAGE_PATTERN.test(value) || LONG_BASE64_IMAGE_HINT.test(value)) {
      return '[REDACTED_IMAGE_DATA]';
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeIntelligenceValue(`${key}.${index}`, item)
    );
  }

  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      SECRET_KEY_PATTERN.test(entryKey)
        ? '[REDACTED_SECRET]'
        : sanitizeIntelligenceValue(entryKey, entryValue),
    ])
  );
}

export function sanitizeIntelligenceRecord(
  record: IntelligenceMemoryRecord
): IntelligenceMemoryRecord {
  const sanitizedValue = sanitizeIntelligenceValue(record.key, record.value);
  const inferredSensitivity = inferSensitivityFromKeyValue(
    record.key,
    record.value
  );
  return {
    ...record,
    value: sanitizedValue,
    sensitivity:
      record.sensitivity === 'public' || record.sensitivity === 'private'
        ? record.sensitivity
        : inferredSensitivity === 'secret' || inferredSensitivity === 'raw-media'
          ? inferredSensitivity
          : record.sensitivity,
  };
}
