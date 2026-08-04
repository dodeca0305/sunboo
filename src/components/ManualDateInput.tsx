'use client';

import { useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import {
  extractDateDigits,
  getMaxDateError,
  isoToDisplay,
  validateManualDateInput,
} from '@/lib/dateInputValidation';

type ManualDateInputProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
  max?: string;
  required?: boolean;
};

export default function ManualDateInput({
  value,
  onChange,
  label,
  max,
  required = false,
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
    const result = validateManualDateInput(
      rawValue,
      max,
    );

    setText(result.displayValue);
    setValidationError(result.error);
    onChange(result.isoValue);
  }

  function handleBlur() {
    const digits = extractDateDigits(text);

    if (digits.length === 0 && required) {
      setValidationError(
        '年月日を入力してください。',
      );
      return;
    }

    if (digits.length > 0 && digits.length < 8) {
      setValidationError(
        '年月日を8桁で入力してください。',
      );
    }
  }

  function handlePickerChange(nextValue: string) {
    setText(isoToDisplay(nextValue || null));

    if (!nextValue) {
      setValidationError(
        required ? '年月日を入力してください。' : null,
      );
      onChange(null);
      return;
    }

    const maxError = getMaxDateError(nextValue, max);

    if (maxError) {
      setValidationError(maxError);
      onChange(null);
      return;
    }

    setValidationError(null);
    onChange(nextValue);
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
          aria-required={required}
          required={required}
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
          max={max}
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
