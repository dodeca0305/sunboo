'use client';

import { parseIntegerInput } from '@/lib/integerInputValidation';

type FormattedIntegerInputProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  ariaLabel: string;
  onBlur?: () => void;
};

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
        const result = parseIntegerInput(
          event.target.value,
        );

        if (result.status === 'unsafe') {
          return;
        }

        onChange(result.value);
      }}
      onBlur={onBlur}
      className="form-input"
    />
  );
}
