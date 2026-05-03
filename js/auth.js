// ============================================================
// AUTH — magic link via Supabase
// ============================================================

window.LifeAuth = (function () {
  const sb = window.sb;

  async function getSession() {
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  async function getUser() {
    const session = await getSession();
    return session?.user || null;
  }

  async function sendMagicLink(email) {
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (error) throw error;
  }

  async function signOut() {
    await sb.auth.signOut();
    window.location.reload();
  }

  function onAuthChange(cb) {
    sb.auth.onAuthStateChange((_evt, session) => cb(session?.user || null));
  }

  return { getSession, getUser, sendMagicLink, signOut, onAuthChange };
})();
