export interface Country {
  /** ISO 3166-1 alpha-2 code. */
  code: string;
  name: string;
}

/** Maximum number of countries a participant may select in one ballot. */
export const MAX_SELECTIONS = 5;

/**
 * Countries offered in the questionnaire. Adding a country is a one-line change here;
 * no schema change is needed because votes store the country code.
 */
export const COUNTRIES: readonly Country[] = [
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SG', name: 'Singapore' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'CN', name: 'China' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'DE', name: 'Germany' },
];

export const COUNTRY_CODES: readonly string[] = COUNTRIES.map((c) => c.code);

const NAMES = new Map(COUNTRIES.map((c) => [c.code, c.name]));

export function countryName(code: string): string {
  return NAMES.get(code) ?? code;
}
