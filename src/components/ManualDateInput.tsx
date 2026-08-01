'use client';

import { useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';

type ManualDateInputProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
};

function toHalfWidthDigits(value: string): string {
  return value.replace(/[０-９]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0xfee0),
  );
}

function extractDateDigits(value: string): string {
  return toHalfWidthDigits(value)
    .replace(/\D/g, '')
    .slice(0, 8);
}

function formatDateDigits(digits: string): string {
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

function isoToDisplay(value: string | null): string {
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

export default function ManualDateInput({
  value,
  onChange,
  label,
}: ManualDateInputProps) {
  const textInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState(() =>
    isoToDisplay(value),
  );
  const [error, setError] = useState<string | null>(
    null,
  );

  function setValidationError(message: string | null) {
    textInputRef.current?.setCustomValidity(message ?? '');
    setError(message);
  }

  function handleTextChange(rawValue: string) {
    const digits = extractDateDigits(rawValue);
    const formattedValue = formatDateDigits(digits);

    setText(formattedValue);

    if (digits.length === 0) {
      setValidationError(null);
      onChange(null);
      return;
    }

    if (digits.length < 8) {
      setValidationError(null);
      return;
    }

    if (!isValidDateDigits(digits)) {
      setValidationError(
        '実在する年月日を入力してください。',
      );
      return;
    }

    setValidationError(null);
    onChange(digitsToIso(digits));
  }

  function handleBlur() {
    const digits = extractDateDigits(text);

    if (digits.length > 0 && digits.length < 8) {
      setValidationError(
        '年月日を8桁で入力してください。',
      );
    }
  }

  function handlePickerChange(nextValue: string) {
    setValidationError(null);
    setText(isoToDisplay(nextValue || null));
    onChange(nextValue || null);
  }

  function openPicker() {
    const picker = pickerRef.current;

    if (!picker) {
      return;
    }

    if (typeof picker.showPicker === 'function') {
      picker.showPicker();
      return;
    }

    picker.click();
  }

  return (
    <div>
      <div className="relative flex gap-2">
        <input
          ref={textInputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          placeholder="例: 2026/08/01"
          value={text}
          onChange={(event) =>
            handleTextChange(event.target.value)
          }
          onBlur={handleBlur}
          aria-label={label}
          aria-invalid={Boolean(error)}
          className="form-input"
        />

        <button
          type="button"
          onClick={openPicker}
          aria-label={`${label}をカレンダーから選択`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        >
          <CalendarDays className="h-5 w-5" />
        </button>

        <input
          ref={pickerRef}
          type="date"
          value={value ?? ''}
          onChange={(event) =>
            handlePickerChange(event.target.value)
          }
          tabIndex={-1}
          aria-label={`${label}のカレンダー`}
          className="absolute right-0 top-0 h-px w-px opacity-0"
        />
      </div>

      {error && (
        <p className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
