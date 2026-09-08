import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, TOKEN_KEY } from './api.js';
import { useLanguage } from './i18n/index.jsx';
import Header from './components/Header.jsx';
import MovieRow from './components/MovieRow.jsx';
import AuthModal from './components/AuthModal.jsx';
import EditProfileModal from './components/EditProfileModal.jsx';
import LoginModal from './components/LoginModal.jsx';
import Pagination from './components/Pagination.jsx';
import GenreMultiSelect from './components/GenreMultiSelect.jsx';
import DrawModal from './components/DrawModal.jsx';
import MovieDetail from './components/MovieDetail.jsx';
import RankingModal from './components/RankingModal.jsx';
import useWatched from './hooks/useWatched.js';
import useWatchlist from './hooks/useWatchlist.js';
import useRating from './hooks/useRating.js';
import { runRecommendationModel } from './ml/runRecommendationModel.js';

// Múltiplo de 12/9/8/6/4/3/2 — reduz a chance de sobrar uma última linha
// pela metade em telas largas (não dá pra zerar 100%, o número de colunas
// muda com a largura da tela).
const PAGE_SIZE = 36;
const MIN_SPIN_MS = 1600;

export default function App() {
  const { t } = useLanguage();

  const [movies, setMovies] = useState([]);
  const [totalMovies, setTotalMovies] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [genres, setGenres] = useState([]);
  const [providerList, setProviderList] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [genreFilters, setGenreFilters] = useState([]);
  const [providerFilter, setProviderFilter] = useState('');
  const [sort, setSort] = useState('popularity');
  const [minRating, setMinRating] = useState('');
  const [maxRating, setMaxRating] = useState('');
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');

  const { watchedIds, isWatched, toggleWatched, showWatched, setShowWatched } = useWatched();
  const { isInWatchlist, toggleWatchlist, removeFromWatchlist } = useWatchlist();
  const { getRating, setRating } = useRating();

  const [profile, setProfile] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recStage, setRecStage] = useState(''); // '' | 'candidates' | 'training' | 'done'
  const [modelInfo, setModelInfo] = useState(null);

  const [authOpen, setAuthOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authInitialMode, setAuthInitialMode] = useState('guest');
  const [authNote, setAuthNote] = useState('');

  const [loginOpen, setLoginOpen] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editProfileLoading, setEditProfileLoading] = useState(false);
  const [editProfileError, setEditProfileError] = useState('');

  const [detailMovie, setDetailMovie] = useState(null);
  const [rankingOpen, setRankingOpen] = useState(false);

  const [drawOpen, setDrawOpen] = useState(false);
  const [drawSpinning, setDrawSpinning] = useState(false);
  const [drawResults, setDrawResults] = useState([]);
  const [drawCount, setDrawCount] = useState(1);

  const [loadError, setLoadError] = useState('');
  const catalogRef = useRef(null);

  // Ponto único pra abrir o cadastro — generic (header/CTA) usa a aba
  // "informar dados"; quando é pra avaliar/comentar, força a aba "criar
  // conta" e mostra o porquê (ver requireAccount abaixo).
  function openAuth(mode = 'guest', note = '') {
    setAuthInitialMode(mode);
    setAuthNote(note);
    setAuthOpen(true);
  }

  // Avaliar e comentar exigem conta de verdade (e-mail + senha) — só
  // "informar dados" não basta (ver routes/feedback.js e routes/comments.js
  // no backend, que fazem a mesma checagem). Devolve true se já pode seguir.
  function requireAccount() {
    if (profile && profile.accountType === 'account') return true;
    openAuth('account', t('auth.accountRequiredNote'));
    return false;
  }

  const SORT_OPTIONS = [
    { value: 'popularity', label: t('sort.popularity') },
    { value: 'rating', label: t('sort.rating') },
    { value: 'year_desc', label: t('sort.yearDesc') },
    { value: 'year_asc', label: t('sort.yearAsc') },
    { value: 'runtime_asc', label: t('sort.runtimeAsc') },
    { value: 'runtime_desc', label: t('sort.runtimeDesc') },
  ];

  // Evita faixa invertida (ex.: "de 2026 até 2000", que não bate com nenhum
  // título e some o catálogo sem explicação): ao editar um dos lados, se o
  // outro lado virar inconsistente, ele simplesmente é limpo — o campo que
  // acabou de ser digitado sempre vale, e a faixa vira "aberta" pro outro
  // lado (ex.: "2026 ou mais") em vez de ficar presa num intervalo vazio.
  function handleRangeChange(newValue, otherValue, setOther, comparator) {
    if (newValue !== '' && otherValue !== '' && comparator(Number(newValue), Number(otherValue))) {
      setOther('');
    }
  }

  function handleMinRatingChange(v) {
    setMinRating(v);
    handleRangeChange(v, maxRating, setMaxRating, (min, max) => min > max);
  }
  function handleMaxRatingChange(v) {
    setMaxRating(v);
    handleRangeChange(v, minRating, setMinRating, (max, min) => max < min);
  }
  function handleYearMinChange(v) {
    setYearMin(v);
    handleRangeChange(v, yearMax, setYearMax, (min, max) => min > max);
  }
  function handleYearMaxChange(v) {
    setYearMax(v);
    handleRangeChange(v, yearMin, setYearMin, (max, min) => max < min);
  }

  // Os mesmos filtros (tipo/gênero/nota/ano/busca/ocultar vistos) valem
  // tanto pra listagem paginada quanto pro sorteio — centralizado aqui pra
  // não desalinhar os dois.
  function buildFilterParams() {
    const params = {};
    if (search) params.search = search;
    if (typeFilter) params.type = typeFilter;
    if (genreFilters.length) params.genre = genreFilters;
    if (providerFilter) params.provider = providerFilter;
    if (minRating) params.minRating = minRating;
    if (maxRating) params.maxRating = maxRating;
    if (yearMin) params.yearMin = yearMin;
    if (yearMax) params.yearMax = yearMax;
    if (!showWatched && watchedIds.length) params.excludeIds = watchedIds.join(',');
    return params;
  }

  // Carrega catálogo + gêneros e tenta restaurar a sessão salva no navegador.
  useEffect(() => {
    api.getGenres().then((d) => setGenres(d.genres)).catch(() => {});
    api.getProviderList().then((d) => setProviderList(d.providers)).catch(() => {});
    loadMovies(1);

    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      api.me()
        .then((d) => setProfile(d.profile))
        .catch(() => localStorage.removeItem(TOKEN_KEY));
    }
  }, []);

  // Sempre que um filtro muda, recomeça a paginação do zero.
  useEffect(() => {
    loadMovies(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, genreFilters, providerFilter, sort, minRating, maxRating, yearMin, yearMax, showWatched]);

  useEffect(() => {
    if (profile && genres.length) loadRecommendations();
    else if (!profile) { setRecommendations([]); setModelInfo(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, genres]);

  function loadMovies(page) {
    const params = { ...buildFilterParams(), page, pageSize: PAGE_SIZE };
    if (sort && sort !== 'popularity') params.sort = sort;
    setCatalogLoading(true);
    api.getMovies(params)
      .then((d) => {
        setMovies(d.items);
        setTotalMovies(d.total);
        setCatalogPage(page);
        setLoadError('');
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setCatalogLoading(false));
  }

  function goToPage(page) {
    loadMovies(page);
    catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Sorteia `drawCount` títulos aleatórios dentre os que batem com os
  // filtros atuais. A "roleta" gira por pelo menos MIN_SPIN_MS mesmo que a
  // resposta do backend chegue antes — senão o efeito passa despercebido.
  async function runDraw() {
    setDrawOpen(true);
    setDrawSpinning(true);
    setDrawResults([]);
    const startedAt = Date.now();
    try {
      const data = await api.drawRandom(drawCount, buildFilterParams());
      const elapsed = Date.now() - startedAt;
      setTimeout(() => {
        setDrawResults(data.items);
        setDrawSpinning(false);
      }, Math.max(0, MIN_SPIN_MS - elapsed));
    } catch (e) {
      setDrawSpinning(false);
      setDrawResults([]);
    }
  }

  // Duas etapas: 1) Qdrant devolve candidatos por similaridade de vetor
  // (rápido, cobre o catálogo inteiro); 2) uma rede neural (TensorFlow.js,
  // treinada agora mesmo no navegador, dentro de um Web Worker) reordena
  // esses candidatos — mesma ideia do worker do projeto de referência.
  async function loadRecommendations() {
    setRecStage('candidates');
    try {
      const data = await api.getRecommendationCandidates();
      setRecommendations(data.items.slice(0, 20));

      setRecStage('training');
      const result = await runRecommendationModel({
        genres,
        userVector: data.userVector,
        items: data.items,
        negativeSamples: data.negativeSamples,
      });

      setRecommendations(result.items.slice(0, 20));
      setModelInfo(result.trained ? result : null);
      setRecStage('done');
    } catch (e) {
      console.error(e);
      setRecStage('done');
    }
  }

  async function handleAuthSubmit(payload) {
    setAuthLoading(true);
    setAuthError('');
    try {
      const data = await api.register(payload);
      localStorage.setItem(TOKEN_KEY, data.token);
      setProfile(data.profile);
      setAuthOpen(false);
    } catch (e) {
      setAuthError(e.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLoginSubmit(payload) {
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await api.login(payload);
      localStorage.setItem(TOKEN_KEY, data.token);
      setProfile(data.profile);
      setLoginOpen(false);
    } catch (e) {
      setLoginError(e.message);
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setProfile(null);
  }

  const sampleMovies = useMemo(() => movies.slice(0, 10), [movies]);
  // Some da lista de recomendação NA HORA ao avaliar (não só depois de
  // clicar "Atualizar recomendações") — já deu nota, já não faz sentido
  // continuar "recomendando". O backend também já exclui isso da próxima
  // busca (ver routes/recommendations.js), esse filtro aqui só evita a
  // espera até o próximo refresh.
  const visibleRecommendations = useMemo(
    () => recommendations.filter((m) => (showWatched || !watchedIds.includes(m.id)) && !getRating(m.id)),
    [recommendations, showWatched, watchedIds, getRating],
  );

  // Marcar como "já vi" precisa sumir da lista NA HORA se estivermos
  // ocultando vistos — sem isso o card só ficava marcado visualmente até a
  // próxima recarga, o que não é o que foi pedido. (Recomendações não
  // precisam disso: já são filtradas de forma reativa em visibleRecommendations.)
  // Marcar como visto significa que não é mais "quero ver depois".
  function syncWatchlistOnWatch(id, wasWatched) {
    if (!wasWatched && isInWatchlist(id)) removeFromWatchlist(id);
  }

  function handleToggleWatched(id) {
    const wasWatched = isWatched(id);
    toggleWatched(id);
    if (!showWatched && !wasWatched) {
      setMovies((prev) => prev.filter((m) => m.id !== id));
      setTotalMovies((tot) => Math.max(0, tot - 1));
    }
    syncWatchlistOnWatch(id, wasWatched);
  }

  // Recomendações usam o toggle "cru" (sem mexer no array de catálogo,
  // que não tem esses ids) — já são filtradas de forma reativa em
  // visibleRecommendations — mas ainda precisam sincronizar a watchlist.
  function handleToggleWatchedRec(id) {
    const wasWatched = isWatched(id);
    toggleWatched(id);
    syncWatchlistOnWatch(id, wasWatched);
  }

  function handleRate(id, score) {
    if (!requireAccount()) return;
    const prev = getRating(id);
    setRating(id, score);
    api.sendFeedback(id, score).catch(() => {
      setRating(id, prev); // desfaz a nota local se o backend não confirmou
    });
  }

  // Favorito não exige conta (é só personalização de perfil) — só um
  // perfil qualquer, guest ou conta.
  async function handleToggleFavorite(id) {
    if (!profile) { openAuth('guest'); return; }
    try {
      const data = await api.toggleFavorite(id);
      setProfile(data.profile);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleEditProfileSubmit(payload) {
    setEditProfileLoading(true);
    setEditProfileError('');
    try {
      const data = await api.updateProfile(payload);
      setProfile(data.profile);
      setEditProfileOpen(false);
    } catch (e) {
      setEditProfileError(e.message);
    } finally {
      setEditProfileLoading(false);
    }
  }

  const recEmptyMessage = (recStage === 'candidates' || recStage === 'training')
    ? t('rec.emptyLoading')
    : t('rec.emptyDefault');

  return (
    <div className="app">
      <Header
        profile={profile}
        onOpenLogin={() => setLoginOpen(true)}
        onOpenRegister={() => openAuth('guest')}
        onOpenEditProfile={() => setEditProfileOpen(true)}
        onOpenRanking={() => setRankingOpen(true)}
        onLogout={handleLogout}
      />

      {!profile && (
        <div className="cta-banner">
          <span>{t('cta.message')}</span>
          <button type="button" className="btn btn-primary" onClick={() => openAuth('guest')}>{t('header.register')}</button>
        </div>
      )}

      {profile && (
        <>
          <MovieRow
            title={t('rec.title')}
            subtitle={t('rec.subtitle', { name: profile.name })}
            movies={visibleRecommendations}
            isWatched={isWatched}
            onToggleWatched={handleToggleWatchedRec}
            getRating={getRating}
            onRate={handleRate}
            onOpen={setDetailMovie}
            isInWatchlist={isInWatchlist}
            onToggleWatchlist={toggleWatchlist}
            emptyMessage={recEmptyMessage}
            headerAction={(
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={loadRecommendations}
                disabled={recStage === 'candidates' || recStage === 'training'}
              >
                {t('rec.refresh')}
              </button>
            )}
          />
          {/* Só afirma "ordenado por rede neural" quando isso é literalmente
              verdade — o worker devolve trained:false (mantendo a ordem por
              similaridade de vetor do Qdrant, sem tocar na rede) quando não
              há candidatos/negativos suficientes pra treinar (ver
              MIN_EXAMPLES em workers/recommendationWorker.js). */}
          {recStage === 'done' && modelInfo && visibleRecommendations.length > 0 && (
            <p className="model-status">{t('rec.status')}</p>
          )}
        </>
      )}

      {loadError && <p className="form-error">{loadError}</p>}

      <div ref={catalogRef} style={{ scrollMarginTop: '5rem' }}>
        <div className="search-hero">
          <input
            className="search-input-hero"
            type="search"
            placeholder={t('search.placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filters">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">{t('filter.allTypes')}</option>
            <option value="filme">{t('filter.movies')}</option>
            <option value="serie">{t('filter.series')}</option>
          </select>

          <GenreMultiSelect genres={genres} selected={genreFilters} onChange={setGenreFilters} />

          {providerList.length > 0 && (
            <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
              <option value="">{t('filter.allProviders')}</option>
              {providerList.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          )}

          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <div className="year-range">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="10"
              step="0.5"
              placeholder={t('filter.ratingMin')}
              value={minRating}
              onChange={(e) => handleMinRatingChange(e.target.value)}
            />
            <span className="year-range-sep">–</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="10"
              step="0.5"
              placeholder={t('filter.ratingMax')}
              value={maxRating}
              onChange={(e) => handleMaxRatingChange(e.target.value)}
            />
          </div>

          <div className="year-range">
            <input
              type="number"
              inputMode="numeric"
              placeholder={t('filter.yearFrom')}
              value={yearMin}
              onChange={(e) => handleYearMinChange(e.target.value)}
            />
            <span className="year-range-sep">–</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder={t('filter.yearTo')}
              value={yearMax}
              onChange={(e) => handleYearMaxChange(e.target.value)}
            />
          </div>

          {watchedIds.length > 0 && (
            <button
              type="button"
              className={showWatched ? 'btn btn-ghost active' : 'btn btn-ghost'}
              onClick={() => setShowWatched((v) => !v)}
            >
              {showWatched ? t('filter.hideWatched', { n: watchedIds.length }) : t('filter.showWatched', { n: watchedIds.length })}
            </button>
          )}

          {(typeFilter || genreFilters.length > 0 || providerFilter || sort !== 'popularity' || minRating || maxRating || yearMin || yearMax) && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setTypeFilter('');
                setGenreFilters([]);
                setProviderFilter('');
                setSort('popularity');
                setMinRating('');
                setMaxRating('');
                setYearMin('');
                setYearMax('');
              }}
            >
              {t('filter.clear')}
            </button>
          )}
        </div>

        <div className="draw-bar">
          <span className="draw-bar-label">{t('draw.prompt')}</span>
          <input
            type="number"
            min="1"
            max="12"
            value={drawCount}
            onChange={(e) => setDrawCount(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
            aria-label={t('draw.quantityLabel')}
          />
          <button type="button" className="btn btn-primary" onClick={runDraw}>{t('draw.button')}</button>
        </div>

        <MovieRow
          title={t('catalog.title')}
          subtitle={t('catalog.subtitle', {
            page: catalogPage,
            totalPages: Math.max(1, Math.ceil(totalMovies / PAGE_SIZE)),
            total: totalMovies,
          })}
          movies={movies}
          isWatched={isWatched}
          onToggleWatched={handleToggleWatched}
          getRating={getRating}
          onRate={handleRate}
          onOpen={setDetailMovie}
          isInWatchlist={isInWatchlist}
          onToggleWatchlist={toggleWatchlist}
          emptyMessage={catalogLoading ? t('common.loading') : t('catalog.empty')}
        />
      </div>

      <Pagination
        page={catalogPage}
        totalPages={Math.ceil(totalMovies / PAGE_SIZE)}
        onChange={goToPage}
        disabled={catalogLoading}
      />

      <DrawModal
        open={drawOpen}
        spinning={drawSpinning}
        results={drawResults}
        spinPool={movies.length ? movies : sampleMovies}
        onClose={() => setDrawOpen(false)}
        onDrawAgain={runDraw}
        isWatched={isWatched}
        onToggleWatched={handleToggleWatched}
        getRating={getRating}
        onRate={handleRate}
        onOpen={setDetailMovie}
        isInWatchlist={isInWatchlist}
        onToggleWatchlist={toggleWatchlist}
      />

      {rankingOpen && (
        <RankingModal
          onClose={() => setRankingOpen(false)}
          onOpen={setDetailMovie}
          isWatched={isWatched}
          onToggleWatched={handleToggleWatchedRec}
          getRating={getRating}
          onRate={handleRate}
        />
      )}

      {/* Fica ANTES dos modais de conta de propósito: se "requireAccount()"
          abre o cadastro por cima do detalhe do filme (ex.: tentou comentar
          sem conta), os dois ficam empilhados — sem essa ordem, o detalhe
          (por vir depois no DOM) pintava por cima e bloqueava os cliques no
          cadastro. */}
      <MovieDetail
        movie={detailMovie}
        onClose={() => setDetailMovie(null)}
        onOpen={setDetailMovie}
        profile={profile}
        getRating={getRating}
        onRate={handleRate}
        isWatched={isWatched}
        onToggleWatched={handleToggleWatched}
        isInWatchlist={isInWatchlist}
        onToggleWatchlist={toggleWatchlist}
        onToggleFavorite={handleToggleFavorite}
        onRequireAccount={requireAccount}
      />

      {authOpen && (
        <AuthModal
          genres={genres}
          sampleMovies={sampleMovies}
          onClose={() => setAuthOpen(false)}
          onSubmit={handleAuthSubmit}
          loading={authLoading}
          error={authError}
          initialMode={authInitialMode}
          note={authNote}
        />
      )}

      {loginOpen && (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onSubmit={handleLoginSubmit}
          loading={loginLoading}
          error={loginError}
          onSwitchToRegister={() => { setLoginOpen(false); openAuth('guest'); }}
        />
      )}

      {editProfileOpen && profile && (
        <EditProfileModal
          profile={profile}
          genres={genres}
          onClose={() => setEditProfileOpen(false)}
          onSubmit={handleEditProfileSubmit}
          loading={editProfileLoading}
          error={editProfileError}
        />
      )}
    </div>
  );
}
