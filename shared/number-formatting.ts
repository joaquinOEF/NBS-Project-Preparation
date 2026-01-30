export function formatNumber(value: number, options?: {
  significantFigures?: number;
  maxDecimals?: number;
  useGrouping?: boolean;
  compact?: boolean;
}): string {
  const {
    significantFigures = 3,
    maxDecimals = 2,
    useGrouping = true,
    compact = true,
  } = options || {};

  if (value === 0) return '0';
  if (!Number.isFinite(value)) return String(value);

  const absValue = Math.abs(value);

  if (compact) {
    if (absValue >= 1_000_000_000) {
      const formatted = (value / 1_000_000_000).toFixed(Math.min(maxDecimals, 1));
      return `${parseFloat(formatted).toLocaleString('en-US')} billion`;
    }
    if (absValue >= 1_000_000) {
      const formatted = (value / 1_000_000).toFixed(Math.min(maxDecimals, 1));
      return `${parseFloat(formatted).toLocaleString('en-US')} million`;
    }
    if (absValue >= 10_000) {
      const rounded = Math.round(value / 1000) * 1000;
      return rounded.toLocaleString('en-US');
    }
  }

  if (absValue >= 1000) {
    const rounded = Math.round(value);
    return useGrouping ? rounded.toLocaleString('en-US') : String(rounded);
  }

  if (absValue >= 100) {
    return value.toFixed(Math.min(maxDecimals, 1));
  }

  if (absValue >= 10) {
    return value.toFixed(Math.min(maxDecimals, 1));
  }

  if (absValue >= 1) {
    return value.toFixed(Math.min(maxDecimals, 2));
  }

  const decimals = Math.min(maxDecimals, Math.max(2, significantFigures - Math.floor(Math.log10(absValue)) - 1));
  return value.toFixed(decimals);
}

export function formatArea(valueM2: number): string {
  if (valueM2 >= 1_000_000) {
    const km2 = valueM2 / 1_000_000;
    return `${formatNumber(km2, { maxDecimals: 1, compact: false })} km²`;
  }
  if (valueM2 >= 10_000) {
    const ha = valueM2 / 10_000;
    return `${formatNumber(ha, { maxDecimals: 1, compact: false })} ha`;
  }
  return `${formatNumber(valueM2, { maxDecimals: 0, compact: false })} m²`;
}

export function formatPercentage(value: number): string {
  if (value >= 10) {
    return `${Math.round(value)}%`;
  }
  return `${value.toFixed(1)}%`;
}

export function formatRange(low: number, high: number, unit: string): string {
  if (unit.includes('%')) {
    return `${formatPercentage(low)}–${formatPercentage(high)}`;
  }
  if (unit.includes('m²') || unit.includes('ha') || unit.includes('km²')) {
    return `${formatArea(low)} to ${formatArea(high)}`;
  }
  return `${formatNumber(low)}–${formatNumber(high)} ${unit}`;
}

export function formatValueWithUnit(value: number, unit: string): string {
  if (unit.includes('m²')) {
    return formatArea(value);
  }
  if (unit.includes('%')) {
    return formatPercentage(value);
  }
  return `${formatNumber(value)} ${unit}`;
}

export const NUMBER_FORMATTING_INSTRUCTIONS = `
## Number Formatting Requirements
- Round large numbers appropriately:
  - Areas: Use hectares (ha) for 10,000+ m², km² for 1,000,000+ m². Example: "10 ha" not "100,000 m²"
  - Large values: Use thousands separator or words. Example: "103 million m²" not "103000000 m²"
  - Percentages: Round to whole numbers when >= 10%, one decimal when < 10%
- Use consistent significant figures (2-3 for most metrics)
- For ranges, format both ends consistently: "0.5–2°C" not "0.5–2.0°C"
- Avoid excessive precision like "424,236.70860707585 m²" - use "42 ha" instead
- Convert internal zone IDs to readable names when possible
`;
