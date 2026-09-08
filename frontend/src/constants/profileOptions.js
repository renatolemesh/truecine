// Compartilhado entre AuthModal (cadastro) e EditProfileModal (editar
// depois) — as duas telas pedem os mesmos dados demográficos, não faz
// sentido duplicar as duas listas.
export function genderOptions(t) {
  return [
    { value: '', label: t('auth.genderUnset') },
    { value: 'feminino', label: t('auth.genderFemale') },
    { value: 'masculino', label: t('auth.genderMale') },
    { value: 'outro', label: t('auth.genderOther') },
  ];
}

// Guardado no perfil por enquanto só como dado demográfico (igual
// idade/sexo) — o catálogo ainda não tem país de origem por título pra
// isso virar um fator real de similaridade no vetor de recomendação.
export function countryOptions(t) {
  return [
    { value: '', label: t('auth.countryUnset') },
    { value: 'BR', label: t('country.BR') },
    { value: 'US', label: t('country.US') },
    { value: 'PT', label: t('country.PT') },
    { value: 'AR', label: t('country.AR') },
    { value: 'MX', label: t('country.MX') },
    { value: 'ES', label: t('country.ES') },
    { value: 'FR', label: t('country.FR') },
    { value: 'DE', label: t('country.DE') },
    { value: 'GB', label: t('country.GB') },
    { value: 'IT', label: t('country.IT') },
    { value: 'JP', label: t('country.JP') },
    { value: 'KR', label: t('country.KR') },
    { value: 'IN', label: t('country.IN') },
    { value: 'OTHER', label: t('country.OTHER') },
  ];
}
