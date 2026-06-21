const COUNTRIES = [
  { code: '+48',  label: 'PL +48',  digits: 9 },
  { code: '+31',  label: 'NL +31',  digits: 9 },
  { code: '+971', label: 'AE +971', digits: 9 },
];

function parseE164(e164) {
  if (!e164) return { cc: '+48', local: '' };
  for (const c of COUNTRIES) {
    if (e164.startsWith(c.code)) return { cc: c.code, local: e164.slice(c.code.length) };
  }
  return { cc: '+48', local: e164 };
}

export default function PhoneInput({ value, onChange, required, disabled }) {
  const { cc, local } = parseE164(value);

  function handleCC(e) {
    onChange(e.target.value + local);
  }

  function handleLocal(e) {
    const digits = e.target.value.replace(/\D/g, '');
    onChange(cc + digits);
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <select
        className="form-select"
        style={{ width: '110px', flexShrink: 0 }}
        value={cc}
        onChange={handleCC}
        disabled={disabled}
      >
        {COUNTRIES.map(c => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
      <input
        className="form-input"
        type="tel"
        inputMode="numeric"
        placeholder="600 100 200"
        value={local}
        onChange={handleLocal}
        required={required}
        disabled={disabled}
        style={{ flex: 1 }}
      />
    </div>
  );
}
