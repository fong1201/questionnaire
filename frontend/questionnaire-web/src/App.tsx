import { countryName, type Country } from '@questionnaire/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { getCountries, submitVote } from './api';

/** Regional-indicator emoji flag from an ISO country code. */
const flag = (code: string) =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));

/** crypto.randomUUID only exists in secure contexts (https/localhost), so fall back to v4 by hand. */
function newBallotId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL as string | undefined;

export function App() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [maxSelections, setMaxSelections] = useState(5);
  const [selected, setSelected] = useState<string[]>([]);
  // One id per ballot: a retry after a network error re-sends the same id and is never double counted.
  const [ballotId, setBallotId] = useState(newBallotId);
  const [loadError, setLoadError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string[]>();

  useEffect(() => {
    getCountries().then(
      (data) => {
        setCountries(data.countries);
        setMaxSelections(data.maxSelections);
      },
      (e: Error) => setLoadError(e.message),
    );
  }, []);

  const limitReached = selected.length >= maxSelections;

  function toggle(code: string) {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : prev.length < maxSelections ? [...prev, code] : prev,
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (selected.length === 0) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      await submitVote({ ballotId, countries: selected });
      setSubmitted(selected);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setSelected([]);
    setSubmitted(undefined);
    setBallotId(newBallotId());
  }

  if (submitted) {
    return (
      <main className="container">
        <h1>Thanks for voting!</h1>
        <p className="muted">Your picks:</p>
        <ul className="picked">
          {submitted.map((code) => (
            <li key={code}>
              <span aria-hidden="true">{flag(code)}</span> {countryName(code)}
            </li>
          ))}
        </ul>
        <div className="actions">
          <button type="button" onClick={startOver}>Submit another response</button>
          {DASHBOARD_URL && <a href={DASHBOARD_URL}>See the results</a>}
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>Where would you like to travel?</h1>
      <p className="muted">Pick up to {maxSelections} countries.</p>
      {loadError && <p className="error" role="alert">{loadError}</p>}

      <form onSubmit={onSubmit}>
        <fieldset className="countries">
          <legend className="sr-only">Countries</legend>
          {countries.map((country) => {
            const checked = selected.includes(country.code);
            return (
              <label key={country.code} className={`country ${checked ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  name="countries"
                  value={country.code}
                  checked={checked}
                  disabled={!checked && limitReached}
                  onChange={() => toggle(country.code)}
                />
                <span className="flag" aria-hidden="true">{flag(country.code)}</span>
                {country.name}
              </label>
            );
          })}
        </fieldset>

        <div className="footer">
          <span className={`counter ${limitReached ? 'full' : ''}`} aria-live="polite">
            {selected.length} / {maxSelections} selected
            {limitReached && ' (maximum reached)'}
          </span>
          <button type="submit" disabled={submitting || selected.length === 0}>
            {submitting ? 'Submitting…' : 'Submit vote'}
          </button>
        </div>
        {submitError && <p className="error" role="alert">{submitError}</p>}
      </form>
    </main>
  );
}
