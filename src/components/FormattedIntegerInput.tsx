'use client';

import { toHalfWidthDigits } from '@/lib/inputNormalization';

type FormattedIntegerInputProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  ariaLabel?: string;
  onBlur?: () => void;
};

function normalizeDigits(value: string): string {
  return toHalfWidthDigits(value)
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '');
}

export default function FormattedIntegerInput({
  value,
  onChange,
  placeholder = '円',
  ariaLabel,
  onBlur,
}: FormattedIntegerInputProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={value === null ? '' : value.toLocaleString('ja-JP')}
      onChange={(event) => {
        const digits = normalizeDigits(event.target.value);

        if (digits === '') {
          onChange(null);
          return;
        }

        const nextValue = Number(digits);

        if (Number.isSafeInteger(nextValue)) {
          onChange(nextValue);
        }
      }}
      onBlur={onBlur}
      className="form-input"
    />
  );
}
