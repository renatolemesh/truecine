// Validação server-side de verdade — o `minLength` do <input> no front é só
// UX, qualquer um pode chamar a API direto e pular ele. Exige 8+
// caracteres com pelo menos uma letra e um número; não exige caractere
// especial (senha decorável ainda é melhor que senha forte anotada num
// post-it, e esse não é um sistema bancário).
const MIN_LENGTH = 8;

function validatePassword(password) {
  if (!password || password.length < MIN_LENGTH) {
    return `A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'A senha precisa ter pelo menos uma letra e um número.';
  }
  return null;
}

module.exports = { validatePassword, MIN_LENGTH };
