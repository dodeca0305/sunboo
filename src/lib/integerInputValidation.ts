import { toHalfWidthDigits } from './inputNormalization.ts';

export type IntegerInputStatus =
  | 'empty'
  | 'valid'
  | 'unsafe';

export type IntegerInputResult = {
  digits: string;
  value: number | null;
  status: IntegerInputStatus;
};

export function normalizeIntegerDigits(
  rawValue: string,
): string {
  return toHalfWidthDigits(rawValue)
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '');
}

export function parseIntegerInput(
  rawValue: string,
): IntegerInputResult {
  const digits = normalizeIntegerDigits(rawValue);

  if (digits === '') {
    return {
      digits,
      value: null,
      status: 'empty',
    };
  }

  const value = Number(digits);

  if (!Number.isSafeInteger(value)) {
    return {
      digits,
      value: null,
      status: 'unsafe',
    };
  }

  return {
    digits,
    value,
    status: 'valid',
  };
}
