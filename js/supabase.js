// Inicializa o cliente do Supabase (UMD bundle exposto em window.supabase)
(function () {
  if (!window.supabase || !window.LIFEOS_CONFIG) {
    console.error('Supabase ou config não carregados');
    return;
  }
  window.sb = window.supabase.createClient(
    window.LIFEOS_CONFIG.supabaseUrl,
    window.LIFEOS_CONFIG.supabaseKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      },
    }
  );
})();
