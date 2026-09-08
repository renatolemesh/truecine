// Idade computada a partir da data de nascimento em vez de guardada como
// número fixo — assim não fica desatualizada com o tempo (um perfil criado
// há 2 anos por alguém de 28 continua correto, em vez de travado em "28").
function calculateAge(birthDate) {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

module.exports = { calculateAge };
