import React, { useState } from 'react';
import { useLanguage } from '../i18n/index.jsx';
import { genderOptions, countryOptions } from '../constants/profileOptions.js';

// Editar os dados já preenchidos — e, se o perfil ainda for "só informar
// dados" (sem e-mail/senha), também dá pra virar conta de verdade aqui
// (necessário pra avaliar títulos e comentar, ver App.jsx).
export default function EditProfileModal({
  profile, genres, onClose, onSubmit, loading, error,
}) {
  const { t, tGenre } = useLanguage();
  const isGuest = profile.accountType !== 'account';

  const [name, setName] = useState(profile.name || '');
  const [birthDate, setBirthDate] = useState(profile.birthDate || '');
  const [gender, setGender] = useState(profile.gender || '');
  const [country, setCountry] = useState(profile.country || '');
  const [preferredType, setPreferredType] = useState(profile.preferredType || 'ambos');
  const [favoriteGenres, setFavoriteGenres] = useState(profile.favoriteGenres || []);
  const [createAccount, setCreateAccount] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const GENDER_OPTIONS = genderOptions(t);
  const COUNTRY_OPTIONS = countryOptions(t);

  function toggleGenre(g) {
    setFavoriteGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
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
    };
    if (isGuest && createAccount) {
      payload.email = email;
      payload.password = password;
    }
    onSubmit(payload);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>×</button>
        <h2>{t('edit.title')}</h2>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            {t('auth.name')}
            <input placeholder={t('auth.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>

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

          {isGuest && (
            <fieldset>
              <legend>{t('edit.createAccountTitle')}</legend>
              {!createAccount ? (
                <button type="button" className="btn btn-ghost btn-full" onClick={() => setCreateAccount(true)}>
                  {t('edit.createAccountCta')}
                </button>
              ) : (
                <>
                  <p className="auth-note">{t('auth.accountRequiredNote')}</p>
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
            </fieldset>
          )}

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? t('edit.submitting') : t('edit.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
