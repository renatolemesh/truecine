import React from 'react';
import logo from '../assets/logo-truecine.png';
import { useLanguage } from '../i18n/index.jsx';

export default function Header({
  profile, onOpenLogin, onOpenRegister, onOpenEditProfile, onOpenRanking, onLogout,
}) {
  const { t, lang, setLang } = useLanguage();

  return (
    <header className="app-header">
      <img src={logo} alt={t('app.name')} className="app-header-logo" />

      <div className="app-header-actions">
        <button type="button" className="btn btn-ghost" onClick={onOpenRanking}>{t('header.ranking')}</button>

        <div className="lang-switch" role="group" aria-label="Language">
          <button
            type="button"
            className={lang === 'pt' ? 'lang-btn active' : 'lang-btn'}
            onClick={() => setLang('pt')}
          >
            PT
          </button>
          <button
            type="button"
            className={lang === 'en' ? 'lang-btn active' : 'lang-btn'}
            onClick={() => setLang('en')}
          >
            EN
          </button>
        </div>

        {profile ? (
          <>
            <span className="profile-badge">{t('header.hello', { name: profile.name })}</span>
            <button type="button" className="btn btn-ghost" onClick={onOpenEditProfile}>{t('header.editProfile')}</button>
            <button type="button" className="btn btn-ghost" onClick={onLogout}>{t('header.logout')}</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" onClick={onOpenLogin}>{t('header.login')}</button>
            <button type="button" className="btn btn-primary" onClick={onOpenRegister}>{t('header.register')}</button>
          </>
        )}
      </div>
    </header>
  );
}
