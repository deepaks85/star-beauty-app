import { normalizeIndiaDigits } from '../types/salon';

interface IndiaPhoneInputProps {
  valueDigits: string;
  onChangeDigits: (digits: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
}

export function IndiaPhoneInput({
  valueDigits,
  onChangeDigits,
  disabled = false,
  id,
  placeholder = '9820144210',
}: IndiaPhoneInputProps) {
  const digits = normalizeIndiaDigits(valueDigits);

  return (
    <div className="flex items-stretch rounded-lg border border-[#D6CEC5] bg-white overflow-hidden focus-within:border-[#8E3B46]">
      <span
        className="inline-flex items-center px-3 bg-[#F2ECE6] border-r border-[#D6CEC5] text-xs font-mono font-medium text-[#1C1917] select-none shrink-0"
        aria-hidden="true"
      >
        +91
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
        disabled={disabled}
        value={digits}
        onChange={(e) => onChangeDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-transparent text-sm font-mono tabular-nums text-[#1C1917] focus:outline-none disabled:bg-[#FAF7F4] disabled:text-[#57534E]"
      />
      <span className="inline-flex items-center pr-3 text-[11px] font-mono tabular-nums text-[#57534E] shrink-0">
        {digits.length}/10
      </span>
    </div>
  );
}
