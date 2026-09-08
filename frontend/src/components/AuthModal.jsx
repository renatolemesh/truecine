import React, { useState } from 'react';
import { useLanguage } from '../i18n/index.jsx';
import { displayTitle } from '../utils/movieTitle.js';
import { genderOptions, countryOptions } from '../constants/profileOptions.js';

export default function AuthModal({
  genres, sampleMovies, onClose, onSubmit, loading, error, initialMode, note,
}) {
  const { t, tGenre, lang } = useLanguage();
  const [mode, setMode] = useState(initialMode || 'guest'); // 'guest' | 'account'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [country, setCountry] = useState('');
  const [preferredType, setPreferredType] = useState('ambos');
  const [favoriteGenres, setFavoriteGenres] = useState([]);
  const [likedMovieIds, setLikedMovieIds] = useState([]);

  const GENDER_OPTIONS = genderOptions(t);
  const COUNTRY_OPTIONS = countryOptions(t);

  function toggleGenre(g) {
    setFavoriteGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  function toggleMovie(id) {
    setLikedMovieIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      name,
      birthDate: birthDate || null,
      gender: gender || null,
      country: country || null,
      preferredType,
      favoriteGenres,
      likedMovieIds,
    };
    if (mode === 'account') {
      payload.email = email;
      payload.password = password;
    }
    onSubmit(payload);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>×</button>
        <h2>{t('auth.title')}</h2>
        {note && <p className="auth-note">{note}</p>}

        <div className="tab-switch">
          <button
            type="button"
            className={mode === 'guest' ? 'tab active' : 'tab'}
            onClick={() => setMode('guest')}
          >
            {t('auth.tabGuest')}
          </button>
          <button
            type="button"
            className={mode === 'account' ? 'tab active' : 'tab'}
            onClick={() => setMode('account')}
          >
            {t('auth.tabAccount')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            {t('auth.name')}
            <input placeholder={t('auth.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>

          {mode === 'account' && (
            <>
              <label>
                {t('auth.email')}
                <input type="email" placeholder={t('auth.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label>
                {t('auth.password')}
                <input type="password" placeholder={t('auth.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </label>
            </>
          )}

          <div className="form-row">
            <label>
              {t('auth.birthDate')}
              <input
                type="date"
                value={birthDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </label>
            <label>
              {t('auth.gender')}
              <select value={gender} onChange={(e) => setGender(e.target.value)}>
                {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              {t('auth.country')}
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              {t('auth.prefer')}
              <select value={preferredType} onChange={(e) => setPreferredType(e.target.value)}>
                <option value="ambos">{t('auth.preferBoth')}</option>
                <option value="filme">{t('auth.preferMovies')}</option>
                <option value="serie">{t('auth.preferSeries')}</option>
              </select>
            </label>
          </div>

          <fieldset>
            <legend>{t('auth.favoriteGenres')}</legend>
            <div className="chip-group">
              {genres.map((g) => (
                <button
                  type="button"
                  key={g}
                  className={favoriteGenres.includes(g) ? 'chip active' : 'chip'}
                  onClick={() => toggleGenre(g)}
                >
                  {tGenre(g)}
                </button>
              ))}
            </div>
          </fieldset>

          {sampleMovies?.length > 0 && (
            <fieldset>
              <legend>{t('auth.likedMovies')}</legend>
              <div className="chip-group">
                {sampleMovies.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    className={likedMovieIds.includes(m.id) ? 'chip active' : 'chip'}
                    onClick={() => toggleMovie(m.id)}
                  >
                    {displayTitle(m, lang)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? t('auth.submitting') : t('auth.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
