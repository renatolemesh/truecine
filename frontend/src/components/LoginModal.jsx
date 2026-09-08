import React, { useState } from 'react';
import { useLanguage } from '../i18n/index.jsx';

export default function LoginModal({ onClose, onSubmit, loading, error, onSwitchToRegister }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ email, password });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>×</button>
        <h2>{t('login.title')}</h2>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            {t('login.email')}
            <input
              type="email"
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            {t('login.password')}
            <input
              type="password"
              placeholder={t('login.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <p className="auth-switch">
          {t('login.noAccount')}{' '}
          <button type="button" className="link-btn" onClick={onSwitchToRegister}>
            {t('login.switchToRegister')}
          </button>
        </p>
      </div>
    </div>
  );
}
