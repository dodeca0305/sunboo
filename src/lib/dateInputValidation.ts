import { toHalfWidthDigits } from './inputNormalization.ts';

export type DateInputValidationStatus =
  | 'empty'
  | 'incomplete'
  | 'invalid'
  | 'after-max'
  | 'valid';

export type DateInputValidationResult = {
  digits: string;
  displayValue: string;
  isoValue: string | null;
  status: DateInputValidationStatus;
  error: string | null;
};

export function extractDateDigits(value: string): string {
  return toHalfWidthDigits(value)
    .replace(/\D/g, '')
    .slice(0, 8);
}

export function formatDateDigits(digits: string): string {
  if (digits.length <= 4) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}/${digits.slice(4)}`;
  }

  return (
    `${digits.slice(0, 4)}/` +
    `${digits.slice(4, 6)}/` +
    digits.slice(6, 8)
  );
}

export function isoToDisplay(value: string | null): string {
  if (!value) {
    return '';
  }

  return value.replaceAll('-', '/');
}

function digitsToIso(digits: string): string {
  return (
    `${digits.slice(0, 4)}-` +
    `${digits.slice(4, 6)}-` +
    digits.slice(6, 8)
  );
}

function isValidDateDigits(digits: string): boolean {
  if (!/^\d{8}$/.test(digits)) {
    return false;
  }

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));

  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const leapYear =
    year % 400 === 0 ||
    (year % 4 === 0 && year % 100 !== 0);

  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return day <= daysInMonth[month - 1];
}

export function getMaxDateError(
  value: string,
  max?: string,
): string | null {
  if (!max || value <= max) {
    return null;
  }

  return `${isoToDisplay(max)}以前の日付を入力してください。`;
}

export function validateManualDateInput(
  rawValue: string,
  max?: string,
): DateInputValidationResult {
  const digits = extractDateDigits(rawValue);
  const displayValue = formatDateDigits(digits);

  if (digits.length === 0) {
    return {
      digits,
      displayValue,
      isoValue: null,
      status: 'empty',
      error: null,
    };
  }

  if (digits.length < 8) {
    return {
      digits,
      displayValue,
      isoValue: null,
      status: 'incomplete',
      error: null,
    };
  }

  if (!isValidDateDigits(digits)) {
    return {
      digits,
      displayValue,
      isoValue: null,
      status: 'invalid',
      error: '実在する年月日を入力してください。',
    };
  }

  const isoValue = digitsToIso(digits);
  const maxError = getMaxDateError(isoValue, max);

  if (maxError) {
    return {
      digits,
      displayValue,
      isoValue: null,
      status: 'after-max',
      error: maxError,
    };
  }

  return {
    digits,
    displayValue,
    isoValue,
    status: 'valid',
    error: null,
  };
}
