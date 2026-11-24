import { askConfirm } from './dialogos.js';

function validCpf(value) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(value[i]) * (length + 1 - i);
    const digit = (sum * 10 % 11) % 10;
    if (digit !== Number(value[length])) return false;
  }
  return true;
}
function profileValues(prefix) {
  const value = id => document.getElementById(prefix + id).value.trim();
  const profile = { nome: value('Name'), sobrenome: value('Surname'), nascimento: value('Birth'), cpf: value('Cpf').replace(/\D/g, '') };
  const date = new Date(profile.nascimento + 'T00:00:00');
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 16);
  if (profile.nome.length < 2 || profile.nome.length > 80 || profile.sobrenome.length < 2 || profile.sobrenome.length > 100) throw Error('Informe nome e sobrenome válidos.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.nascimento) || Number.isNaN(date.getTime()) || date.getFullYear() !== Number(profile.nascimento.slice(0,4)) || date.getMonth()+1 !== Number(profile.nascimento.slice(5,7)) || date.getDate() !== Number(profile.nascimento.slice(8,10)) || date > cutoff) throw Error('Informe uma data válida. Você precisa ter pelo menos 16 anos.');
  if (!validCpf(profile.cpf)) throw Error('O CPF informado é inválido.');
  return profile;
}
async function initAuth(onReady) {
  const $ = id => document.getElementById(id);
  const db = window.granaDB;
  let user = null, profile = null, epoch = 0, activeId = null;
  let completion = false;
  for (const id of ['registerBirth', 'registerCpf']) {
    $(id).closest('.auth-field').hidden = true;
    $(id).required = false;
  }
  let recovering = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
  const recoveryForm = document.createElement('form');
  recoveryForm.hidden = true;
  recoveryForm.innerHTML = '<div class="auth-field"><label for="recoveryPassword">Nova senha</label><input id="recoveryPassword" type="password" autocomplete="new-password" minlength="6" required></div><p id="recoveryError" class="auth-error" role="alert" hidden></p><button class="btn primary" type="submit">Salvar nova senha</button>';
  $('registerForm').after(recoveryForm);
  const resetButton = document.createElement('button');
  resetButton.type = 'button'; resetButton.className = 'btn'; resetButton.textContent = 'Esqueci minha senha';
  $('loginForm').append(resetButton);
  const recoveryGate = () => {
    gate(); $('loginForm').hidden = true; $('registerForm').hidden = true; recoveryForm.hidden = false;
    $('authTitle').textContent = 'Redefina sua senha';
  };
  const message = (id, text) => { $(id).textContent = text; $(id).hidden = !text; };
  const errorText = error => error.code === '23505' ? 'Não foi possível salvar este CPF. Confira os dados ou entre em contato com o suporte.' : error.message || 'Não foi possível concluir. Tente novamente.';
  const run = (form, errorId, action) => form.addEventListener('submit', async event => {
    event.preventDefault(); message(errorId, '');
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    try { await action(); } catch (error) { message(errorId, errorText(error)); }
    finally { button.disabled = false; }
  });
  const mode = register => {
    if (completion || recovering) return;
    $('loginForm').hidden = register; $('registerForm').hidden = !register;
    $('authTitle').textContent = register ? 'Crie sua conta' : 'Bem-vindo';
    $('loginModeBtn').classList.toggle('active', !register); $('registerModeBtn').classList.toggle('active', register);
    $('loginModeBtn').setAttribute('aria-selected', String(!register)); $('registerModeBtn').setAttribute('aria-selected', String(register));
  };
  const gate = () => { document.body.classList.add('auth-required'); $('authGate').hidden = false; $('profileMenu').hidden = true; $('profileBtn').hidden = true; };
  const fill = prefix => { for (const [field, column] of Object.entries({Name:'nome',Surname:'sobrenome',Birth:'nascimento',Cpf:'cpf'})) $(prefix+field).value = profile?.[column] || ''; };
  const saveProfile = async values => {
    const id = user?.id, ticket = epoch;
    if (!id) throw Error('Entre novamente para salvar seu perfil.');
    const { data, error } = await db.from('perfis').update({...values, atualizado_em:new Date().toISOString()}).eq('id', id).select('id,nome,sobrenome,nascimento,cpf').single();
    if (error) throw error;
    if (ticket !== epoch) throw Error('Sua sessão mudou. Entre novamente.');
    profile = data;
  };
  const show = async session => {
    const ticket = ++epoch;
    if (activeId && session?.user?.id !== activeId) { location.reload(); return; }
    user = session?.user || null; gate();
    if (!user) return;
    if (recovering) { recoveryGate(); return; }
    const {data, error} = await db.from('perfis').select('id,nome,sobrenome,nascimento,cpf').eq('id', user.id).maybeSingle();
    if (ticket !== epoch) return;
    if (error) throw error;
    if (!data) throw Error('Perfil ausente. Solicite a execução do backfill de perfis no banco.');
    profile = data;
    completion = !data.nome || !data.sobrenome || !data.nascimento || !data.cpf;
    if (completion) {
      mode(false); $('loginForm').hidden = true; $('registerForm').hidden = false;
      $('authTitle').textContent = 'Complete seu perfil';
      $('authDesc').textContent = 'Salve seus dados para continuar.';
      fill('register');
      for (const id of ['registerBirth', 'registerCpf']) {
        $(id).closest('.auth-field').hidden = false;
        $(id).required = true;
      }
      for (const id of ['registerEmail','registerPassword']) { $(id).closest('.auth-field').hidden = true; $(id).required = false; $(id).value = ''; }
      return;
    }
    if (!activeId) { activeId = user.id; window.granaUserId = user.id; onReady(); }
    $('profileName').textContent = data.nome + ' ' + data.sobrenome; $('profileEmail').textContent = user.email;
    $('authGate').hidden = true; $('profileBtn').hidden = false; document.body.classList.remove('auth-required');
  };
  if (!db) { document.body.classList.remove('auth-loading'); message('loginError','Não foi possível carregar o Supabase. Confira a conexão.'); return; }
  resetButton.onclick = async () => {
    resetButton.disabled = true;
    try {
      if (!$('loginEmail').checkValidity()) throw Error('Informe seu e-mail no campo acima.');
      const {error} = await db.auth.resetPasswordForEmail($('loginEmail').value.trim(), {redirectTo:location.origin+location.pathname});
      if (error) throw error;
      message('loginError','Se houver uma conta para esse e-mail, você receberá as instruções.');
    } catch(error) { message('loginError',errorText(error)); }
    finally { resetButton.disabled = false; }
  };
  run(recoveryForm,'recoveryError',async () => {
    if ($('recoveryPassword').value.length < 6) throw Error('Use pelo menos 6 caracteres.');
    const {error} = await db.auth.updateUser({password:$('recoveryPassword').value});
    if(error) throw error;
    recoveryForm.reset(); recovering = false; recoveryForm.hidden = true;
    history.replaceState(null,'',location.pathname+location.search);
    await show({user});
  });
  $('loginModeBtn').onclick = () => mode(false); $('registerModeBtn').onclick = () => mode(true);
  run($('loginForm'), 'loginError', async () => {
    const {data,error} = await db.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});
    $('loginPassword').value = ''; if(error) throw error; await show(data.session);
  });
  run($('registerForm'), 'registerError', async () => {
    if (completion) {
      await saveProfile(profileValues('register'));
      await show({user});
      return;
    }
    const values = {nome:$('registerName').value.trim(), sobrenome:$('registerSurname').value.trim()};
    if (values.nome.length < 2 || values.nome.length > 80 || values.sobrenome.length < 2 || values.sobrenome.length > 100) throw Error('Informe nome e sobrenome válidos.');
    if (!$('registerEmail').checkValidity()) throw Error('Informe um e-mail válido.');
    if ($('registerPassword').value.length < 6) throw Error('Use pelo menos 6 caracteres na senha.');
    const {data,error} = await db.auth.signUp({email:$('registerEmail').value.trim(), password:$('registerPassword').value, options:{emailRedirectTo:location.origin+location.pathname, data:{nome:values.nome,sobrenome:values.sobrenome}}});
    $('registerPassword').value = ''; if(error) throw error;
    if(data.session) { await show(data.session); }
    else { $('registerForm').reset(); mode(false); message('loginError','Confira seu e-mail para confirmar o cadastro. Após entrar, complete CPF e nascimento.'); }
  });
  $('profileBtn').onclick = () => { $('profileMenu').hidden = !$('profileMenu').hidden; $('profileBtn').setAttribute('aria-expanded',String(!$('profileMenu').hidden)); };
  $('profileEditBtn').onclick = () => { fill('profileEdit'); $('profileEditForm').hidden = false; $('changePasswordForm').hidden = true; };
  $('cancelProfileBtn').onclick = () => { $('profileEditForm').hidden = true; $('profileEditForm').reset(); };
  run($('profileEditForm'),'profileEditError',async () => { await saveProfile(profileValues('profileEdit')); $('profileEditForm').hidden=true; await show({user}); });
  $('profilePasswordBtn').onclick = () => { $('changePasswordForm').hidden=false; $('profileEditForm').hidden=true; };
  $('cancelPasswordBtn').onclick = () => { $('changePasswordForm').hidden=true; $('changePasswordForm').reset(); };
  run($('changePasswordForm'),'changePasswordError',async () => {
    const {error:loginError}=await db.auth.signInWithPassword({email:user.email,password:$('currentPassword').value});
    if(loginError) throw loginError;
    const {error}=await db.auth.updateUser({password:$('newPassword').value}); if(error) throw error;
    $('changePasswordForm').reset(); $('changePasswordForm').hidden=true;
    askConfirm({title:'Senha alterada',message:'Sua senha foi atualizada.',single:true});
  });
  $('profileLogoutBtn').onclick = async () => {
    gate(); ++epoch;
    const {error}=await db.auth.signOut();
    if(error) { message('loginError',errorText(error)); return; }
    location.reload();
  };
  db.auth.onAuthStateChange((event,session) => {
    if(event==='SIGNED_OUT' || (activeId && session?.user?.id!==activeId)) { gate(); location.reload(); }
    if(event==='PASSWORD_RECOVERY') { recovering=true; user=session.user; setTimeout(recoveryGate,0); }
    if(event==='TOKEN_REFRESHED') user=session.user;
  });
  try { const {data,error}=await db.auth.getSession(); if(error) throw error; await show(data.session); }
  catch(error) { message('loginError',errorText(error)); }
  finally { document.body.classList.remove('auth-loading'); }
}
export { initAuth, validCpf, profileValues };
