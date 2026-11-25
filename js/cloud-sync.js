(() => {
  const cfg = window.JEE_CLOUD_CONFIG || {};
  const TABLE = 'jee_tracker_state';
  const OWNER_KEY = 'jeePhysicsTracker.cloudOwner.v1';
  const CLIENT_VERSION = '2.119.2';
  let client = null, user = null, lastLocal = null, lastRemoteAt = '';
  let selected = false, channel = null, pushTimer = null, loading = false, initialized = false;
  const $ = id => document.getElementById(id);
  const dialog = $('cloudDialog');

  function status(message) { const el = $('cloudStatus'); if (el) el.textContent = message; }
  function ready() { return !!(cfg.url && cfg.anonKey); }
  function owner() { try { return localStorage.getItem(OWNER_KEY) || ''; } catch (_) { return ''; } }
  function markOwner(id) { try { localStorage.setItem(OWNER_KEY, id); } catch (_) {} }
  function setUI() {
    const signed = !!user, foreignOwner = !!owner() && owner() !== user?.id;
    if ($('cloudAuthFields')) $('cloudAuthFields').hidden = signed;
    if ($('cloudSignOut')) $('cloudSignOut').hidden = !signed;
    if ($('cloudSyncNow')) $('cloudSyncNow').hidden = !signed || !selected;
    if ($('cloudChoiceActions')) $('cloudChoiceActions').hidden = !signed || selected;
    if ($('cloudUploadLocal')) $('cloudUploadLocal').hidden = foreignOwner;
    if ($('cloudStartFresh')) $('cloudStartFresh').hidden = !foreignOwner;
    if ($('cloudAccountBtn')) $('cloudAccountBtn').textContent = signed ? `Cloud: ${user.email}` : 'Cloud sync';
  }
  function errText(e) { return e?.message || 'Cloud request failed. Check your connection and project setup.'; }
  async function ensureClient() {
    if (client) return client;
    if (!ready()) throw Error('Cloud database is not configured. Follow CLOUD-DATABASE-SETUP.md and set the project URL and public key in js/cloud-config.js.');
    if (!navigator.onLine) throw Error('You are offline. Your practice is still saved on this device.');
    if (!window.supabase) await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${CLIENT_VERSION}/dist/umd/supabase.js`;
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => reject(Error('Could not load the cloud library. Check your internet connection.'));
      document.head.appendChild(script);
    });
    client = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    client.auth.onAuthStateChange((_event, session) => setTimeout(() => handleSession(session), 0));
    return client;
  }
  async function stopRealtime() {
    const old = channel; channel = null;
    if (old && client) await client.removeChannel(old);
  }
  async function handleSession(session) {
    const next = session?.user || null;
    if ((next?.id || '') === (user?.id || '')) { setUI(); return; }
    await stopRealtime(); user = next; selected = false; lastRemoteAt = ''; window._jeePendingCloudState = null; setUI();
    if (!user) { status('Signed out. Your local tracker remains on this device.'); return; }
    const sessionUser = user.id;
    status(`Checking private cloud save for ${user.email}…`);
    try {
      const { data, error } = await client.from(TABLE).select('state,updated_at').eq('user_id', sessionUser).maybeSingle();
      if (error) throw error;
      if (user?.id !== sessionUser) return;
      window._jeePendingCloudState = data ? window.Store.normalize(data.state) : null;
      lastRemoteAt = data?.updated_at || '';
      const otherOwner = !!owner() && owner() !== sessionUser;
      status(data
        ? 'A cloud save exists for this account. Load it to this device, or start fresh if this device belongs to another account.'
        : otherOwner
          ? 'This device has data linked to another account. Start fresh before using this account, so their data is not uploaded.'
          : 'No cloud save exists for this account yet. Upload this device’s tracker data to start syncing.');
      if ($('cloudChoiceActions')) $('cloudChoiceActions').hidden = false;
      setUI();
    } catch (e) { if (user?.id === sessionUser) status(`Could not read this account’s cloud save: ${errText(e)}`); }
  }
  async function applyRemote(row, expectedUser = user?.id) {
    if (!row?.state || !expectedUser || user?.id !== expectedUser) return;
    const safe = window.Store.normalize(row.state);
    await window.Store.save(safe, { cloud: false });
    if (user?.id !== expectedUser) return;
    lastLocal = safe; lastRemoteAt = row.updated_at || new Date().toISOString(); markOwner(expectedUser);
    window.dispatchEvent(new CustomEvent('jee-cloud-state', { detail: safe }));
  }
  function startRealtime() {
    if (!client || !user || !selected) return;
    const sessionUser = user.id;
    stopRealtime().then(() => {
      if (user?.id !== sessionUser || !selected) return;
      channel = client.channel(`private-tracker-${sessionUser}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${sessionUser}` }, payload => {
          if (user?.id !== sessionUser || !selected || payload.new?.user_id !== sessionUser) return;
          const stamp = String(payload.new.updated_at || '');
          if (payload.new?.state && (!lastRemoteAt || stamp > String(lastRemoteAt))) {
            applyRemote(payload.new, sessionUser).catch(e => status(`Could not apply cloud update: ${errText(e)}`));
          }
        }).subscribe();
    });
  }
  async function selectRemote() {
    const state = window._jeePendingCloudState;
    if (!state || !user || loading) return;
    loading = true; status('Loading this account’s cloud save…');
    try {
      await applyRemote({ state, updated_at: lastRemoteAt }, user.id);
      selected = true; window._jeePendingCloudState = null; setUI(); startRealtime();
      status('Cloud copy loaded. Changes now sync automatically across your signed-in devices.');
    } catch (e) { status(`Could not load the cloud save: ${errText(e)}`); }
    finally { loading = false; }
  }
  async function uploadLocal() {
    if (!user || loading) return;
    if (owner() && owner() !== user.id) { status('This device belongs to another cloud account. Start fresh before uploading.'); return; }
    loading = true; status('Uploading this device’s tracker data…');
    try {
      lastLocal = window.Store.normalize(lastLocal || await window.Store.load());
      selected = true; await pushNow(); markOwner(user.id); window._jeePendingCloudState = null;
      setUI(); startRealtime();
    } catch (e) { selected = false; setUI(); status(`Upload failed: ${errText(e)}`); }
    finally { loading = false; }
  }
  async function startFresh() {
    if (!user || loading || !confirm('Clear the tracker saved on this device before connecting it to this account? This cannot be undone unless you exported a backup.')) return;
    loading = true;
    try {
      await window.Store.save(window.Store.defaults(), { cloud: false });
      lastLocal = await window.Store.load(); markOwner(user.id);
      window.dispatchEvent(new CustomEvent('jee-cloud-state', { detail: lastLocal }));
      setUI();
      if (window._jeePendingCloudState) {
        await applyRemote({ state: window._jeePendingCloudState, updated_at: lastRemoteAt }, user.id);
        selected = true; window._jeePendingCloudState = null; setUI(); startRealtime();
        status('Cloud copy loaded. Changes now sync automatically across your signed-in devices.');
      }
      else { status('Fresh tracker ready for this account. Upload this device to begin cloud sync.'); if ($('cloudUploadLocal')) $('cloudUploadLocal').hidden = false; }
    } catch (e) { status(`Could not reset local tracker: ${errText(e)}`); }
    finally { loading = false; }
  }
  async function pushNow() {
    if (!client || !user || !selected) return;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    const sessionUser = user.id, snapshot = window.Store.normalize(lastLocal || await window.Store.load());
    const { data, error } = await client.from(TABLE).upsert({ user_id: sessionUser, state: snapshot, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('updated_at').single();
    if (error) throw error;
    if (user?.id !== sessionUser) return;
    lastLocal = snapshot; lastRemoteAt = data?.updated_at || new Date().toISOString(); markOwner(sessionUser);
    status(`Synced for ${user.email}. Other signed-in devices update live.`);
  }
  function queue(data) {
    lastLocal = window.Store.normalize(data);
    if (!selected || !user) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushNow().catch(e => status(`Cloud sync paused: ${errText(e)}`)), 900);
  }
  function bind() {
    if (initialized) return; initialized = true;
    $('cloudAccountBtn').onclick = async () => {
      dialog.showModal(); setUI();
      if (!ready()) status('Cloud is not configured. Follow CLOUD-DATABASE-SETUP.md; local practice remains available.');
      else if (!client) try { await ensureClient(); const { data, error } = await client.auth.getSession(); if (error) throw error; await handleSession(data.session); } catch (e) { status(errText(e)); }
    };
    $('cloudSignUp').onclick = async () => { try {
      const c = await ensureClient(), email = $('cloudEmail').value.trim(), password = $('cloudPassword').value;
      if (!email || password.length < 12) throw Error('Enter your email and use a password with at least 12 characters.');
      const { data, error } = await c.auth.signUp({ email, password }); if (error) throw error;
      if (data.session) await handleSession(data.session); else status('Account created. Check your email for a verification link, then sign in.');
    } catch (e) { status(errText(e)); } };
    $('cloudSignIn').onclick = async () => { try {
      const c = await ensureClient(), email = $('cloudEmail').value.trim(), password = $('cloudPassword').value;
      if (!email || !password) throw Error('Enter your email and password.');
      const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw error; await handleSession(data.session);
    } catch (e) { status(errText(e)); } };
    $('cloudSignOut').onclick = async () => { try {
      if (client) { const { error } = await client.auth.signOut(); if (error) throw error; }
      selected = false; await stopRealtime(); user = null; setUI(); status('Signed out. Your local tracker remains on this device.');
    } catch (e) { status(errText(e)); } };
    $('cloudLoadRemote').onclick = selectRemote; $('cloudUploadLocal').onclick = uploadLocal;
    $('cloudStartFresh').onclick = startFresh; $('cloudSyncNow').onclick = () => pushNow().catch(e => status(`Sync failed: ${errText(e)}`));
    window.addEventListener('online', () => { if (ready() && user && selected) pushNow().catch(e => status(errText(e))); });
  }
  async function init(data) {
    lastLocal = window.Store.normalize(data); bind(); setUI();
    if (!ready()) { status('Cloud is not configured; local-only mode is active.'); return; }
    if (!navigator.onLine) { status('Offline. Your tracker is saved on this device; cloud sync will resume when online.'); return; }
    try { const c = await ensureClient(), { data: sessionData, error } = await c.auth.getSession(); if (error) throw error; if (sessionData.session) await handleSession(sessionData.session); else status('Cloud ready. Sign in to sync your private progress between devices.'); }
    catch (e) { status(errText(e)); }
  }
  window.CloudSync = { init, queue };
})();
