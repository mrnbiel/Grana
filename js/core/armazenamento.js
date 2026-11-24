// Isola o armazenamento financeiro provisório por conta. Dados legados são preservados.
const userStorage = {
  key(key) {
    if (!window.granaUserId) throw Error('Sessão necessária para acessar dados financeiros.');
    return 'grana_usuario:' + window.granaUserId + ':' + key;
  },
  getItem(key) { return localStorage.getItem(this.key(key)); },
  setItem(key, value) { localStorage.setItem(this.key(key), value); },
  removeItem(key) { localStorage.removeItem(this.key(key)); }
};
export { userStorage };
