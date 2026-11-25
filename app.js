(() => {
  'use strict';
  const BRAND = { name: 'BenchPilot', shortName: 'BenchPilot', tagline: 'Plan it. Build it. Track it.' };
  const STORE_KEY = 'jabo-workshop-data-v1'; // Kept stable so existing workshop data remains available.
  const USER_STORE_PREFIX = `${STORE_KEY}-user-`;
  const LEGACY_CLAIM_KEY = `${STORE_KEY}-legacy-claimed-by`;
  const CLOUD_REVISION_PREFIX = `${STORE_KEY}-cloud-revision-`;
  const CLOUD_BASE_PREFIX = `${STORE_KEY}-cloud-base-`;
  const STATE_VERSION = 12;
  const DEFAULT_BRANDING = { shopName: '', personalName: '', logoDataUrl: '', primaryColor: '#174b3d', secondaryColor: '#22634e', backgroundColor: '#f7f7f3', surfaceColor: '#ffffff', textColor: '#202722' };
  const DEFAULT_FEATURE_VISIBILITY = { buildsMenu: true, cutCalculator: true, projectStatus: true, projectNotes: true, projectSawKerf: true, cutDrawings: true, projectMaterials: true, projectBuilds: true, buildVersionHistory: true };
  const FEATURE_OPTIONS = [
    ['buildsMenu', 'Builds menu', 'Hide the reusable Builds page and its navigation entry. Existing saved builds remain intact.'],
    ['cutCalculator', 'Cut calculator', 'Hide the calculator page and its quick tool widget.'],
    ['projectStatus', 'Project status', 'Hide status badges, status filters, and the status field in project editing.'],
    ['projectNotes', 'Project notes', 'Hide project notes from details and the project editor.'],
    ['projectSawKerf', 'Project saw kerf adjustment', 'Hide the per-project blade kerf control. Saved kerf values remain in use.'],
    ['cutDrawings', 'Cut drawings', 'Hide board and sheet drawings while keeping cut planning active.'],
    ['projectMaterials', 'Project material assignments', 'Hide the project inventory assignment panel without changing reservations.'],
    ['projectBuilds', 'Project build assignments', 'Hide build assignment controls inside projects. Pinned build parts remain in project requirements.'],
    ['buildVersionHistory', 'Build version history', 'Hide the saved version history panel; project snapshots remain unchanged.']
  ];
  const DASHBOARD_WIDGETS = [
    ['quickActions', 'Quick actions', 'Shortcuts for common workshop tasks.'],
    ['projectOverview', 'Project overview', 'Active work, completed work, and recent projects.'],
    ['recentProjects', 'Recent projects', 'Open recently updated projects.'],
    ['recentBuilds', 'Recent builds', 'Open saved reusable designs.'],
    ['inventoryOverview', 'Materials overview', 'See stock counts and open inventory.'],
    ['projectStatus', 'Project status overview', 'See the count of projects in each status.'],
    ['cutCalculator', 'Cut calculator', 'Add or subtract measurements from the dashboard.']
  ];
  const DEFAULT_DASHBOARD_WIDGETS = ['quickActions', 'projectOverview', 'inventoryOverview', 'recentBuilds'];
  const TOOLBOX_TOOLS = [
    ['cutCalculator', 'Cut calculator', 'Add or subtract workshop measurements.', '⌗', 'calculator'],
    ['measurementConverter', 'Measurement converter', 'Convert between imperial and metric units.', '↔', 'converter'],
    ['areaVolume', 'Area & volume', 'Estimate surfaces, rooms, and rectangular volumes.', '▱', 'areaVolume'],
    ['angleCalculator', 'Angle calculator', 'Calculate angles, rise/run, and slope.', '∠', 'angle'],
    ['weightQuantity', 'Weight & quantity', 'Estimate item counts and total weight.', '⚖', 'weight'],
    ['timers', 'Stopwatch & timers', 'Track elapsed work or run several timers at once.', '◷', 'timers']
  ];
  const DEFAULT_TOOLBOX_TOOLS = TOOLBOX_TOOLS.map(([id]) => id);
  const DEFAULT_SETTINGS = { units: 'inches', numberFormat: 'fraction', kerf: 0.125, branding: DEFAULT_BRANDING, darkMode: false, materialCardSize: 'medium', features: DEFAULT_FEATURE_VISIBILITY, dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS, toolboxTools: DEFAULT_TOOLBOX_TOOLS, toolboxTimers: { stopwatch: { elapsedMs: 0, startedAt: null }, timers: [] } };
  const COLOR_SCHEMES = {
    forest: { primaryColor: '#174b3d', secondaryColor: '#22634e', backgroundColor: '#f7f7f3', surfaceColor: '#ffffff', textColor: '#202722' },
    ocean: { primaryColor: '#22546b', secondaryColor: '#34768a', backgroundColor: '#f1f6f8', surfaceColor: '#ffffff', textColor: '#202a30' },
    clay: { primaryColor: '#874b39', secondaryColor: '#b36549', backgroundColor: '#faf4ef', surfaceColor: '#fffdfb', textColor: '#332923' },
    slate: { primaryColor: '#414d63', secondaryColor: '#5a6e87', backgroundColor: '#f2f4f7', surfaceColor: '#ffffff', textColor: '#202631' }
  };
  const emptyState = { version: STATE_VERSION, projects: [], materials: [], builds: [], settings: structuredClone(DEFAULT_SETTINGS) };
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const uid = () => crypto.randomUUID();
  const supabaseConfig = window.BENCHPILOT_SUPABASE_CONFIG;
  const supabaseClient = window.supabase?.createClient && supabaseConfig?.url && supabaseConfig?.publishableKey
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.publishableKey, { auth: { autoRefreshToken: true, persistSession: true } })
    : null;
  const cloudAvailable = !!supabaseClient && (location.protocol === 'https:' || location.hostname === 'localhost');
  let storageBlocked = false, storageDirty = false, loadProblem = '', storageBlockedReason = '';
  let authUser = null, authUserId = null, cloudRevision = null, cloudConflict = null, cloudTimer = null, cloudSyncing = false, cloudStatus = cloudAvailable ? 'Offline mode · saved on this device' : 'Open the HTTPS app to sign in and sync';
  let state = loadState(), currentPage = 'dashboard', currentProjectId = null, currentBuildId = null, dashboardEditMode = false, dashboardDraggedWidget = null, toolboxEditMode = false, toolboxDraggedTool = null, currentToolId = null;
  let projectSearch = '', projectStatusFilter = 'all', projectVisibilityFilter = 'active', materialTypeFilter = 'all', materialThicknessFilter = 'all', toastTimer;
  const completedTimerNotices = new Set();

  function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function normalizedBranding(value) {
    const source = isRecord(value) ? value : {}, result = { ...DEFAULT_BRANDING };
    for (const key of ['shopName', 'personalName']) if (typeof source[key] === 'string') result[key] = source[key].trim().slice(0, 80);
    if (typeof source.logoDataUrl === 'string' && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(source.logoDataUrl) && source.logoDataUrl.length <= 700000) result.logoDataUrl = source.logoDataUrl;
    for (const key of ['primaryColor', 'secondaryColor', 'backgroundColor', 'surfaceColor', 'textColor']) if (typeof source[key] === 'string' && /^#[0-9a-f]{6}$/i.test(source[key])) result[key] = source[key];
    return result;
  }
  function normalizedSettings(value) {
    const settings = { ...structuredClone(DEFAULT_SETTINGS), ...(isRecord(value) ? value : {}) };
    settings.branding = normalizedBranding(value?.branding);
    settings.darkMode = value?.darkMode === true;
    settings.materialCardSize = ['small', 'medium', 'large'].includes(value?.materialCardSize) ? value.materialCardSize : DEFAULT_SETTINGS.materialCardSize;
    settings.features = { ...DEFAULT_FEATURE_VISIBILITY, ...(isRecord(value?.features) ? Object.fromEntries(Object.entries(value.features).filter(([key, enabled]) => Object.hasOwn(DEFAULT_FEATURE_VISIBILITY, key) && typeof enabled === 'boolean')) : {}) };
    const validWidgets = new Set(DASHBOARD_WIDGETS.map(([id]) => id));
    settings.dashboardWidgets = [...new Set((Array.isArray(value?.dashboardWidgets) ? value.dashboardWidgets : DEFAULT_DASHBOARD_WIDGETS).filter(id => validWidgets.has(id)))];
    const validTools = new Set(TOOLBOX_TOOLS.map(([id]) => id));
    settings.toolboxTools = [...new Set((Array.isArray(value?.toolboxTools) ? value.toolboxTools : DEFAULT_TOOLBOX_TOOLS).filter(id => validTools.has(id)))];
    const savedTimers = isRecord(value?.toolboxTimers) ? value.toolboxTimers : {}, stopwatch = isRecord(savedTimers.stopwatch) ? savedTimers.stopwatch : {};
    settings.toolboxTimers = {
      stopwatch: { elapsedMs: Number.isFinite(Number(stopwatch.elapsedMs)) && Number(stopwatch.elapsedMs) >= 0 ? Number(stopwatch.elapsedMs) : 0, startedAt: Number.isFinite(Number(stopwatch.startedAt)) && Number(stopwatch.startedAt) > 0 ? Number(stopwatch.startedAt) : null },
      timers: Array.isArray(savedTimers.timers) ? savedTimers.timers.filter(timer => isRecord(timer) && typeof timer.id === 'string' && typeof timer.name === 'string' && Number.isFinite(Number(timer.durationMs)) && Number(timer.durationMs) > 0 && Number(timer.durationMs) <= 604800000).slice(0, 20).map(timer => ({ id: timer.id, name: timer.name.trim().slice(0, 60) || 'Shop timer', durationMs: Number(timer.durationMs), remainingMs: Number.isFinite(Number(timer.remainingMs)) ? Math.max(0, Number(timer.remainingMs)) : Number(timer.durationMs), endsAt: Number.isFinite(Number(timer.endsAt)) && Number(timer.endsAt) > 0 ? Number(timer.endsAt) : null })) : []
    };
    return settings;
  }
  function featureEnabled(key) { return state.settings.features?.[key] !== false; }
  function validOptionalPositiveNumber(record, key) { return record[key] === undefined || record[key] === null || (Number.isFinite(Number(record[key])) && Number(record[key]) > 0); }
  function validPartRecords(parts) { return Array.isArray(parts) && parts.every(part => isRecord(part) && (part.id === undefined || typeof part.id === 'string') && (part.materialId === undefined || part.materialId === null || typeof part.materialId === 'string') && ['length', 'width', 'thickness'].every(key => validOptionalPositiveNumber(part, key)) && (part.quantity === undefined || part.quantity === null || (Number.isInteger(Number(part.quantity)) && Number(part.quantity) > 0))); }
  function validProjects(value) { return Array.isArray(value) && value.every(p => isRecord(p) && typeof p.name === 'string' && validPartRecords(p.parts) && (p.materialAllocations === undefined || (Array.isArray(p.materialAllocations) && p.materialAllocations.every(a => isRecord(a) && typeof a.materialId === 'string' && Number.isInteger(Number(a.quantity)) && Number(a.quantity) >= 0)))); }
  function validMaterials(value) { return Array.isArray(value) && value.every(item => isRecord(item) && (item.id === undefined || typeof item.id === 'string') && (item.name === undefined || typeof item.name === 'string') && (item.woodType === undefined || typeof item.woodType === 'string') && ['length', 'width', 'thickness'].every(key => validOptionalPositiveNumber(item, key)) && (item.onHand === undefined || item.onHand === null || (Number.isInteger(Number(item.onHand)) && Number(item.onHand) >= 0))); }
  function validBuildParts(parts) { return Array.isArray(parts) && parts.every(part => part && typeof part.id === 'string' && Number.isFinite(Number(part.length)) && Number(part.length) > 0 && Number.isInteger(Number(part.quantity)) && Number(part.quantity) > 0); }
  function validBuilds(value) { return Array.isArray(value) && value.every(b => b && typeof b.id === 'string' && typeof b.name === 'string' && Array.isArray(b.versions) && b.versions.every(v => v && Number.isInteger(Number(v.number)) && Number(v.number) > 0 && validBuildParts(v.parts)) && (b.draft === undefined || b.draft === null || (b.draft && Number.isInteger(Number(b.draft.versionNumber)) && Number(b.draft.versionNumber) > 0 && (b.draft.baseVersionId === null || typeof b.draft.baseVersionId === 'string') && validBuildParts(b.draft.parts) && (b.draft.savedParts === undefined || validBuildParts(b.draft.savedParts)) && typeof b.draft.dirty === 'boolean'))); }
  function validProjectBuilds(projects) { return projects.every(p => p.builds === undefined || (Array.isArray(p.builds) && p.builds.every(ref => ref && typeof ref.id === 'string' && typeof ref.buildId === 'string' && Number.isInteger(Number(ref.quantity)) && Number(ref.quantity) > 0 && Number.isInteger(Number(ref.versionNumber)) && Number(ref.versionNumber) > 0 && validBuildParts(ref.snapshot?.parts)))); }
  function activeStoreKey() {
    if (authUserId) return `${USER_STORE_PREFIX}${authUserId}`;
    try { return localStorage.getItem(LEGACY_CLAIM_KEY) ? `${STORE_KEY}-anonymous` : STORE_KEY; }
    catch { return STORE_KEY; }
  }
  function accountRevisionKey(userId = authUserId) { return `${CLOUD_REVISION_PREFIX}${userId}`; }
  function accountBaseKey(userId = authUserId) { return `${CLOUD_BASE_PREFIX}${userId}`; }
  function loadState(key = activeStoreKey()) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return structuredClone(emptyState);
      const saved = JSON.parse(raw);
      if (!isRecord(saved) || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(saved.version) || !validProjects(saved.projects) || !validProjectBuilds(saved.projects) || (saved.materials !== undefined && !validMaterials(saved.materials)) || (saved.builds !== undefined && !validBuilds(saved.builds)) || (saved.settings !== undefined && !isRecord(saved.settings))) throw new Error('The saved workshop data has an unsupported format.');
      if (saved.version < 3) for (const p of saved.projects) for (const part of p.parts || []) {
        if (part.materialId) { delete part.width; delete part.thickness; }
        else if (part.width !== undefined || part.thickness !== undefined) { part.legacyDimensions = { width: part.width, thickness: part.thickness }; delete part.width; delete part.thickness; }
      }
      const result = { version: STATE_VERSION, projects: saved.projects, materials: Array.isArray(saved.materials) ? saved.materials : [], builds: Array.isArray(saved.builds) ? saved.builds : [], settings: normalizedSettings(saved.settings) };
      if (!['inches', 'metric'].includes(result.settings.units)) result.settings.units = 'inches';
      if (!['fraction', 'decimal'].includes(result.settings.numberFormat)) result.settings.numberFormat = 'fraction';
      if (!Number.isFinite(Number(result.settings.kerf)) || Number(result.settings.kerf) < 0) result.settings.kerf = DEFAULT_SETTINGS.kerf;
      result.settings.kerf = Number(result.settings.kerf);
      if (saved.version !== STATE_VERSION || !Array.isArray(saved.materials) || !Array.isArray(saved.builds) || !saved.settings || !Number.isFinite(Number(saved.settings.kerf)) || !isRecord(saved.settings.branding)) {
        try { localStorage.setItem(key, JSON.stringify(result)); }
        catch (error) { storageDirty = true; storageBlocked = true; storageBlockedReason = 'migration'; loadProblem = 'Saved workshop data was read, but its upgrade could not be saved. Writing is paused to protect the original copy.'; console.warn('Workshop data loaded but its migration could not be saved; future writes are paused to protect the original copy.', error); }
      }
      return result;
    } catch (error) { storageBlocked = true; storageBlockedReason = 'read'; loadProblem = error.message || 'Saved workshop data could not be read.'; console.warn('Could not read saved workshop data. The original copy was left untouched.', error); return structuredClone(emptyState); }
  }
  function save() {
    if (storageBlocked) { storageDirty = true; updateTopbarSyncButton(); toast(storageBlockedReason === 'migration' ? 'Saving is paused because the saved data upgrade could not be completed. Download a recovery copy, then reopen the app or restore a backup.' : 'Saving is paused because the existing saved data could not be read. Restore a backup first; the original copy is preserved.', true); return false; }
    try { state.version = STATE_VERSION; localStorage.setItem(activeStoreKey(), JSON.stringify(state)); storageDirty = false; if (authUserId) scheduleCloudSync(); updateTopbarSyncButton(); return true; }
    catch (e) { storageDirty = true; updateTopbarSyncButton(); toast('Could not save to browser storage. Your latest changes are still open in this window; download a backup before closing.', true); return false; }
  }
  function setCloudStatus(message) { cloudStatus = message; const target = $('[data-cloud-status]'); if (target) target.textContent = message; updateTopbarSyncButton(); }
  function updateTopbarSyncButton() {
    const button = $('[data-action="topbar-sync"]'), label = $('[data-topbar-sync-label]'); if (!button || !label) return;
    let text = 'Sync', title = 'Sync your workshop with your private cloud account.', status = 'ready';
    if (storageBlocked) { text = 'Recover'; title = 'Saved data needs recovery. Open Account settings for recovery options.'; status = 'warning'; }
    else if (storageDirty) { text = 'Save'; title = 'Some changes may not be saved. Open Account settings to download a backup.'; status = 'warning'; }
    else if (!cloudAvailable) { text = 'Saved'; title = 'Your workshop is saved on this device. Open Account settings to see cloud sync options.'; status = 'local'; }
    else if (cloudConflict) { text = 'Resolve'; title = 'Choose which workshop copy to keep.'; status = 'conflict'; }
    else if (!authUser) { text = 'Sign in'; title = 'Open Account settings to sign in and enable cloud sync.'; status = 'local'; }
    else if (cloudSyncing || cloudStatus.includes('Syncing')) { text = 'Syncing'; title = 'Syncing your latest workshop changes.'; status = 'syncing'; }
    else if (!navigator.onLine) { text = 'Offline'; title = 'Changes are saved on this device and will sync when you reconnect.'; status = 'offline'; }
    else if (cloudStatus.startsWith('Synced')) { text = 'Synced'; title = `${cloudStatus}. Click to sync now.`; status = 'synced'; }
    else if (cloudStatus.includes('waiting to sync') || cloudStatus.startsWith('Saved here')) { text = 'Saving'; title = 'Changes are saved locally and waiting to sync.'; status = 'pending'; }
    else if (cloudStatus.startsWith('Sync paused')) { text = 'Retry'; title = `${cloudStatus}. Click to retry.`; status = 'warning'; }
    else { text = 'Sync'; title = cloudStatus; }
    label.textContent = text; button.title = title; button.setAttribute('aria-label', title); button.dataset.state = status; button.disabled = cloudSyncing;
    const icon = $('.topbar-sync-icon', button); if (icon) icon.classList.toggle('is-syncing', cloudSyncing);
  }
  function openAccountSettings() {
    requestBuildExit(() => { currentProjectId = null; currentBuildId = null; currentPage = 'account'; renderApp(); });
  }
  function handleTopbarSync() {
    if (storageBlocked || storageDirty || cloudConflict || !cloudAvailable || !authUser) { openAccountSettings(); return; }
    if (!navigator.onLine) { setCloudStatus('Offline · changes saved on this device'); toast('Your workshop is saved here. Cloud sync will resume when you reconnect.'); return; }
    syncCloudNow();
  }
  function hasWorkshopRecords(value) {
    const settings = value?.settings || DEFAULT_SETTINGS;
    const hasBranding = JSON.stringify(normalizedBranding(settings.branding)) !== JSON.stringify(DEFAULT_BRANDING);
    const preferences = normalizedSettings(settings);
    const hasPreferences = preferences.darkMode !== DEFAULT_SETTINGS.darkMode || preferences.materialCardSize !== DEFAULT_SETTINGS.materialCardSize || JSON.stringify(preferences.features) !== JSON.stringify(DEFAULT_FEATURE_VISIBILITY) || JSON.stringify(preferences.dashboardWidgets) !== JSON.stringify(DEFAULT_DASHBOARD_WIDGETS) || JSON.stringify(preferences.toolboxTools) !== JSON.stringify(DEFAULT_TOOLBOX_TOOLS) || preferences.toolboxTimers.stopwatch.elapsedMs > 0 || preferences.toolboxTimers.stopwatch.startedAt !== null || preferences.toolboxTimers.timers.length > 0;
    return !!(value?.projects?.length || value?.materials?.length || value?.builds?.length || settings.units !== DEFAULT_SETTINGS.units || settings.numberFormat !== DEFAULT_SETTINGS.numberFormat || Number(settings.kerf) !== DEFAULT_SETTINGS.kerf || hasBranding || hasPreferences);
  }
  function normalizeCloudData(value) {
    if (!isRecord(value) || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(value.version) || !validProjects(value.projects) || !validProjectBuilds(value.projects) || (value.materials !== undefined && !validMaterials(value.materials)) || (value.builds !== undefined && !validBuilds(value.builds)) || (value.settings !== undefined && !isRecord(value.settings))) throw new Error('The cloud workshop data has an unsupported format. Your local data was left unchanged.');
    const projects = structuredClone(value.projects), materials = structuredClone(value.materials || []), builds = structuredClone(value.builds || []);
    if (value.version < 3) for (const p of projects) for (const part of p.parts || []) {
      if (part.materialId) { delete part.width; delete part.thickness; }
      else if (part.width !== undefined || part.thickness !== undefined) { part.legacyDimensions = { width: part.width, thickness: part.thickness }; delete part.width; delete part.thickness; }
    }
    const settings = normalizedSettings(value.settings);
    if (!['inches', 'metric'].includes(settings.units)) settings.units = DEFAULT_SETTINGS.units;
    if (!['fraction', 'decimal'].includes(settings.numberFormat)) settings.numberFormat = DEFAULT_SETTINGS.numberFormat;
    if (!Number.isFinite(Number(settings.kerf)) || Number(settings.kerf) < 0) settings.kerf = DEFAULT_SETTINGS.kerf;
    settings.kerf = Number(settings.kerf);
    return { version: STATE_VERSION, projects, materials, builds, settings };
  }
  function rememberCloudBase(snapshot, revision) {
    cloudRevision = revision;
    localStorage.setItem(accountRevisionKey(), String(revision));
    localStorage.setItem(accountBaseKey(), JSON.stringify(snapshot));
  }
  function applyCloudSnapshot(snapshot, announce = true) {
    if (!authUserId) return;
    const nextState = normalizeCloudData(snapshot.data);
    localStorage.setItem(activeStoreKey(), JSON.stringify(nextState));
    localStorage.setItem(LEGACY_CLAIM_KEY, authUserId);
    state = nextState;
    storageBlocked = false; storageDirty = false; storageBlockedReason = ''; loadProblem = '';
    rememberCloudBase(state, Number(snapshot.revision));
    cloudConflict = null;
    setCloudStatus(`Synced · ${new Date(snapshot.updated_at).toLocaleString()}`);
    if (announce) { renderApp(); toast('Cloud workshop loaded on this device.'); }
  }
  async function readCloudSnapshot() {
    const { data, error } = await supabaseClient.from('user_workshop').select('data, revision, updated_at').eq('user_id', authUserId).maybeSingle();
    if (error) throw error;
    return data;
  }
  function presentConflict(remote, message = 'This device and the cloud both have changes.') {
    cloudConflict = remote;
    setCloudStatus('Sync paused · choose which copy to keep');
    renderApp();
    toast(message, true);
  }
  async function activateAccount(user) {
    if (!user) {
      if (authUserId) { authUserId = null; authUser = null; cloudRevision = null; cloudConflict = null; state = loadState(activeStoreKey()); }
      setCloudStatus(navigator.onLine ? 'Offline mode · saved on this device' : 'Offline · saved on this device');
      renderApp();
      return;
    }
    if (authUserId === user.id) { authUser = user; return; }
    const canUseLegacy = !localStorage.getItem(LEGACY_CLAIM_KEY) && !localStorage.getItem(`${USER_STORE_PREFIX}${user.id}`);
    const legacy = canUseLegacy ? loadState(STORE_KEY) : structuredClone(emptyState);
    authUser = user; authUserId = user.id;
    const localKey = activeStoreKey(), localRaw = localStorage.getItem(localKey);
    state = localRaw === null ? structuredClone(emptyState) : loadState(localKey);
    if (localRaw === null && canUseLegacy && hasWorkshopRecords(legacy)) {
      state = legacy;
      localStorage.setItem(localKey, JSON.stringify(state));
      localStorage.setItem(LEGACY_CLAIM_KEY, user.id);
    }
    const savedRevision = Number(localStorage.getItem(accountRevisionKey()));
    cloudRevision = Number.isFinite(savedRevision) && savedRevision > 0 ? savedRevision : null;
    cloudConflict = null;
    setCloudStatus('Checking cloud workshop…'); renderApp();
    try {
      const remote = await readCloudSnapshot();
      if (remote) {
        if (localRaw === null && canUseLegacy && hasWorkshopRecords(legacy)) {
          state = legacy;
          localStorage.setItem(localKey, JSON.stringify(state));
          localStorage.setItem(LEGACY_CLAIM_KEY, user.id);
          presentConflict(remote, 'Choose whether to upload this device’s workshop or use the existing cloud copy.');
          return;
        }
        if (localRaw === null || !hasWorkshopRecords(state)) { applyCloudSnapshot(remote); return; }
        const base = localStorage.getItem(accountBaseKey());
        const localJson = JSON.stringify(state);
        if (base && localJson === base) { applyCloudSnapshot(remote); return; }
        if (base && cloudRevision === Number(remote.revision)) {
          rememberCloudBase(normalizeCloudData(remote.data), Number(remote.revision));
          cloudConflict = remote;
          setCloudStatus('Sync paused · choose which copy to keep'); renderApp();
          return;
        }
        presentConflict(remote);
        return;
      }
      if (localRaw === null && canUseLegacy && hasWorkshopRecords(legacy)) state = legacy;
      localStorage.setItem(localKey, JSON.stringify(state));
      localStorage.setItem(LEGACY_CLAIM_KEY, user.id);
      cloudRevision = null;
      setCloudStatus('Uploading this device’s workshop…');
      await syncCloudNow();
      renderApp();
    } catch (error) {
      setCloudStatus(navigator.onLine ? `Sync unavailable · ${error.message || 'check connection'}` : 'Offline · changes saved on this device');
      renderApp();
    }
  }
  function scheduleCloudSync() {
    if (!authUserId || !supabaseClient || cloudConflict) return;
    clearTimeout(cloudTimer);
    setCloudStatus(navigator.onLine ? 'Saved here · waiting to sync…' : 'Offline · changes saved on this device');
    cloudTimer = setTimeout(() => syncCloudNow(), 900);
  }
  async function syncCloudNow() {
    if (!authUserId || !supabaseClient || cloudConflict) return;
    if (!navigator.onLine) { setCloudStatus('Offline · changes saved on this device'); return; }
    if (cloudSyncing) { scheduleCloudSync(); return; }
    cloudSyncing = true;
    const syncingUserId = authUserId, snapshot = structuredClone(state), expectedRevision = cloudRevision;
    setCloudStatus('Syncing…');
    try {
      let result;
      if (expectedRevision === null) {
        result = await supabaseClient.from('user_workshop').insert({ user_id: syncingUserId, data: snapshot, revision: 1 }).select('revision, updated_at').maybeSingle();
      } else {
        result = await supabaseClient.from('user_workshop').update({ data: snapshot, revision: expectedRevision + 1, updated_at: new Date().toISOString() }).eq('user_id', syncingUserId).eq('revision', expectedRevision).select('revision, updated_at').maybeSingle();
      }
      if (result.error) {
        const remote = await readCloudSnapshot();
        if (remote) { presentConflict(remote, 'The cloud copy changed before this save could sync.'); return; }
        throw result.error;
      }
      if (!result.data) {
        const remote = await readCloudSnapshot();
        if (remote) { presentConflict(remote, 'The cloud copy changed before this save could sync.'); return; }
        throw new Error('Cloud save was not accepted.');
      }
      if (authUserId !== syncingUserId) return;
      rememberCloudBase(snapshot, Number(result.data.revision));
      localStorage.setItem(LEGACY_CLAIM_KEY, syncingUserId);
      setCloudStatus(`Synced · ${new Date(result.data.updated_at).toLocaleString()}`);
      if (JSON.stringify(state) !== JSON.stringify(snapshot)) scheduleCloudSync();
    } catch (error) {
      setCloudStatus(navigator.onLine ? `Sync paused · ${error.message || 'try again'}` : 'Offline · changes saved on this device');
    } finally { cloudSyncing = false; updateTopbarSyncButton(); }
  }
  function chooseCloudCopy() {
    if (!cloudConflict) return;
    const remote = cloudConflict;
    try { applyCloudSnapshot(remote); }
    catch (error) { setCloudStatus('Cloud copy could not be saved on this device'); toast(error.message || 'Could not apply the cloud copy. Check device storage and try again.', true); }
  }
  async function chooseDeviceCopy() {
    if (!cloudConflict) return;
    if (!confirm('Replace the cloud workshop with this device’s current data? This affects only your signed-in account.')) return;
    const remote = cloudConflict;
    cloudRevision = remote ? Number(remote.revision) : null;
    cloudConflict = null;
    await syncCloudNow();
    renderApp();
  }
  async function submitCloudAuth(event) {
    event.preventDefault();
    if (!cloudAvailable) { toast('Cloud sign-in requires the HTTPS hosted app. This local file launcher remains offline-only.', true); return; }
    const form = new FormData(event.target), email = String(form.get('email') || '').trim(), password = String(form.get('password') || '');
    const mode = event.submitter?.dataset.authMode || 'signin';
    if (!email || !password) { toast('Enter your email and password.', true); return; }
    setCloudStatus(mode === 'signup' ? 'Creating account…' : 'Signing in…');
    try {
      const response = mode === 'signup'
        ? await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}${location.pathname}` } })
        : await supabaseClient.auth.signInWithPassword({ email, password });
      if (response.error) { setCloudStatus('Not signed in'); toast(response.error.message, true); return; }
      if (!response.data.session) { setCloudStatus('Check your email to confirm your account, then sign in.'); toast('Account created. Confirm the email if prompted, then sign in.'); renderApp(); return; }
      await activateAccount(response.data.user);
    } catch (error) { setCloudStatus('Sign-in unavailable'); toast(error.message || 'Could not connect to Supabase.', true); }
  }
  if (cloudAvailable) {
    supabaseClient.auth.onAuthStateChange((_event, session) => { Promise.resolve().then(() => activateAccount(session?.user || null)); });
    supabaseClient.auth.getSession().then(({ data, error }) => { if (error) setCloudStatus(`Sign-in status unavailable · ${error.message}`); else activateAccount(data.session?.user || null); });
  }
  window.addEventListener('online', () => { if (cloudConflict) return; setCloudStatus('Connection restored · syncing…'); syncCloudNow(); });
  window.addEventListener('offline', () => { if (authUserId) setCloudStatus('Offline · changes saved on this device'); });
  window.addEventListener('focus', () => { if (authUserId && !cloudConflict) syncCloudNow(); });
  function toast(message, error = false) { $('.toast')?.remove(); const n = document.createElement('div'); n.className = `toast${error ? ' error' : ''}`; n.textContent = message; document.body.append(n); clearTimeout(toastTimer); toastTimer = setTimeout(() => n.remove(), 3000); }
  function touch(p) { p.updatedAt = new Date().toISOString(); }
  function project(id) { return state.projects.find(p => p.id === id); }
  function stockItem(id) { return state.materials.find(m => m.id === id); }
  function build(id) { return state.builds.find(b => b.id === id); }
  function currentBuildVersion(b) { return [...(b?.versions || [])].sort((a, z) => Number(z.number) - Number(a.number))[0] || null; }
  function buildParts(b) { return b?.draft?.parts || currentBuildVersion(b)?.parts || []; }
  function startBuildDraft(b) { if (!b.draft) { const current = currentBuildVersion(b); b.draft = { versionNumber: current ? Number(current.number) + 1 : 1, baseVersionId: current?.id || null, parts: structuredClone(current?.parts || []), savedParts: structuredClone(current?.parts || []), dirty: false, updatedAt: new Date().toISOString() }; } return b.draft; }
  function updateBuildDraft(b, parts) { const draft = startBuildDraft(b); draft.parts = structuredClone(parts).map(part => { const material=stockItem(part.materialId); return { ...part, width:Number(part.width)>0?Number(part.width):Number(material?.width)||undefined }; }); draft.dirty = true; draft.updatedAt = new Date().toISOString(); b.updatedAt = draft.updatedAt; }
  function saveBuildDraft(b) { if (!b?.draft) return false; const draft = b.draft, oldSavedParts = structuredClone(draft.savedParts || []), oldDirty = draft.dirty; draft.savedParts = structuredClone(draft.parts); draft.dirty = false; draft.updatedAt = new Date().toISOString(); b.updatedAt = draft.updatedAt; if (save()) return true; draft.savedParts = oldSavedParts; draft.dirty = oldDirty; return false; }
  function finalizeBuildDraft(b) {
    if (!b?.draft) return false;
    const draft = b.draft, versionCount = b.versions.length;
    commitBuildVersion(b, draft.parts); b.draft = null;
    if (save()) return true;
    b.versions.length = versionCount; b.draft = draft;
    return false;
  }
  let pendingBuildExit = null;
  function requestBuildExit(next) {
    const active = build(currentBuildId);
    if (!active?.draft?.dirty) { next(); return; }
    pendingBuildExit = next;
    openModal(`<h2>Unsaved build draft</h2><p class="modal-subtitle">Choose whether to save the latest part changes as the draft checkpoint before leaving, discard changes since the last checkpoint, or keep editing.</p><p id="modal-error" class="modal-inline-error"></p><div class="modal-footer draft-exit-actions"><button type="button" class="button button-secondary" data-action="cancel-build-exit">Keep editing</button><button type="button" class="button button-quiet button-danger" data-action="discard-build-draft-exit">Discard changes</button><button type="button" class="button button-primary" data-action="save-build-draft-exit">Save and leave</button></div>`);
  }
  function resolveBuildExit(saveChanges) {
    const active = build(currentBuildId), draft = active?.draft;
    if (draft?.dirty) {
      const oldParts = structuredClone(draft.parts), oldSavedParts = structuredClone(draft.savedParts || []), oldDirty = draft.dirty;
      if (saveChanges) { draft.savedParts = structuredClone(draft.parts); draft.dirty = false; }
      else { draft.parts = structuredClone(draft.savedParts || []); draft.dirty = false; }
      draft.updatedAt = new Date().toISOString(); active.updatedAt = draft.updatedAt;
      if (!save()) { draft.parts = oldParts; draft.savedParts = oldSavedParts; draft.dirty = oldDirty; return; }
    }
    const next = pendingBuildExit; pendingBuildExit = null; closeModal(); next?.();
  }
  function snapshotBuild(b, version = currentBuildVersion(b)) { return version ? { id: b.id, name: b.name, versionId: version.id, versionNumber: version.number, description: b.description || '', parts: structuredClone(version.parts || []) } : null; }
  function allProjectParts(p) {
    const regular = (p.parts || []).map(part => ({ ...part }));
    const included = (p.builds || []).flatMap(ref => (ref.snapshot?.parts || []).map(part => ({ ...part, id: `${ref.id}:${part.id}`, quantity: (Number(part.quantity) || 1) * (Number(ref.quantity) || 1), buildRefId: ref.id, sourcePartId: part.id, sourceBuildName: ref.buildName || ref.snapshot.name, sourceBuildVersion: ref.versionNumber ?? ref.snapshot.versionNumber })));
    return [...regular, ...included];
  }
  function projectPartCount(p) { return allProjectParts(p).length; }
  function materialUsed(materialId) { return state.projects.some(p => allProjectParts(p).some(part => part.materialId === materialId)) || state.builds.some(b => (b.versions || []).some(v => (v.parts || []).some(part => part.materialId === materialId)) || buildParts(b).some(part => part.materialId === materialId)); }
  function projectMaterialAllocation(p, materialId) { return Number(p.materialAllocations?.find(item => item.materialId === materialId)?.quantity) || 0; }
  function assignedMaterialCount(materialId) { return state.projects.filter(p => !p.archived && p.status !== 'complete').reduce((sum, p) => sum + projectMaterialAllocation(p, materialId), 0); }
  function unitName() { return state.settings.units === 'metric' ? 'mm' : 'inches'; }
  function applyWorkspaceAppearance() {
    const branding = normalizedBranding(state.settings.branding), root = document.documentElement, darkMode = state.settings.darkMode === true;
    root.dataset.theme = darkMode ? 'dark' : 'light';
    root.dataset.showProjectNotes = String(featureEnabled('projectNotes'));
    root.dataset.showProjectMaterials = String(featureEnabled('projectMaterials'));
    root.dataset.showProjectBuilds = String(featureEnabled('projectBuilds'));
    root.dataset.showProjectSawKerf = String(featureEnabled('projectSawKerf'));
    root.dataset.showCutDrawings = String(featureEnabled('cutDrawings'));
    root.dataset.showBuildVersionHistory = String(featureEnabled('buildVersionHistory'));
    root.style.setProperty('--green', branding.primaryColor);
    root.style.setProperty('--green2', branding.secondaryColor);
    root.style.setProperty('--canvas', darkMode ? '#141a16' : branding.backgroundColor);
    root.style.setProperty('--paper', darkMode ? '#202923' : branding.surfaceColor);
    root.style.setProperty('--ink', darkMode ? '#edf2ed' : branding.textColor);
    root.style.setProperty('--line', darkMode ? '#39443b' : '#e8e9e4');
    root.style.setProperty('--muted', darkMode ? '#aab4aa' : '#777e77');
    root.style.setProperty('--sage', darkMode ? '#2b392f' : '#e8efe9');
    root.style.setProperty('--shadow', darkMode ? '0 14px 42px #0006' : '0 14px 42px #18251b12');
    const themeColor = $('meta[name="theme-color"]'); if (themeColor) themeColor.content = darkMode ? '#141a16' : branding.primaryColor;
    const brand = $('.brand'), mark = $('.brand-mark'), avatar = $('.avatar'), shopLabel = branding.shopName || 'WORKSHOP';
    if (brand) { brand.setAttribute('aria-label', `${BRAND.name} · ${branding.shopName || 'Workshop'} dashboard`); const small = $('small', brand); if (small) small.textContent = shopLabel.toUpperCase(); }
    if (mark) mark.innerHTML = branding.logoDataUrl ? `<img class="workspace-logo" src="${branding.logoDataUrl}" alt="">` : '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 8.5 16 3l10 5.5v15L16 29 6 23.5z"/><path d="M6 8.5 16 14l10-5.5M16 14v15M11 5.8l10 5.5"/></svg>';
    if (avatar) { const name = branding.personalName || branding.shopName || BRAND.shortName; avatar.innerHTML = branding.logoDataUrl ? `<img class="workspace-avatar-logo" src="${branding.logoDataUrl}" alt="">` : esc(name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()); avatar.setAttribute('aria-label', name); }
    const localName = $('.local-status strong'); if (localName) localName.textContent = branding.shopName || 'Your workshop';
  }
  function roundText(n, places = 4) { return Number(Number(n).toFixed(places)).toString(); }
  function parseMeasurement(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    let s = String(value ?? '').trim().replace(/[″”]/g, '"').replace(/[′’]/g, "'").replace(/\s*(inches|inch|in\.?|\")\s*$/i, '').trim();
    if (!s || s.includes("'")) return null;
    let m = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/) || s.match(/^(-?\d+)[- ](\d+)\s*\/\s*(\d+)$/);
    if (m) { const d = Number(m[3]); return d ? Math.sign(Number(m[1])) * (Math.abs(Number(m[1])) + Number(m[2]) / d) : null; }
    m = s.match(/^(-?\d+)\s*\/\s*(\d+)$/); if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
    return /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) ? Number(s) : null;
  }
  function parseInput(value) { let v = String(value ?? '').trim(); if (state.settings.units === 'metric') v = v.replace(/\s*mm\s*$/i, ''); const n = parseMeasurement(v); return n === null ? null : state.settings.units === 'metric' ? n / 25.4 : n; }
  function fraction(n, denominator = 16) {
    const sign = n < 0 ? '−' : '', ticks = Math.round(Math.abs(n) * denominator), whole = Math.floor(ticks / denominator);
    let num = ticks % denominator; if (!num) return `${sign}${whole}″`;
    let den = denominator; const gcd = (a, b) => b ? gcd(b, a % b) : a; const d = gcd(num, den); num /= d; den /= d;
    return `${sign}${whole ? `${whole} ` : ''}${num}/${den}″`;
  }
  function displayMeasure(value) {
    const n = parseMeasurement(value); if (n === null) return esc(value || '—');
    if (state.settings.units === 'metric') return `${roundText(n * 25.4, 2)} mm`;
    if (state.settings.numberFormat === 'fraction') return fraction(n);
    return `${roundText(n)}″`;
  }
  function inputMeasure(inches) {
    if (inches === null || inches === undefined || inches === '') return '';
    return state.settings.units === 'metric' ? roundText(Number(inches) * 25.4, 2) : state.settings.numberFormat === 'fraction' ? fraction(Number(inches)).replace(/″$/, '') : roundText(inches);
  }
  function stockLabel(m) { return `${m.name?.trim() ? `${m.name.trim()} · ` : ''}${m.woodType} · ${displayMeasure(m.length)} × ${displayMeasure(m.width)} × ${displayMeasure(m.thickness)}`; }
  function materialKind(m) { return String(m.materialType || (String(m.woodType).toLowerCase().includes('plywood') ? 'plywood' : 'lumber')).toLowerCase(); }
  function optimizeCuts(material, parts, tolerance = 0, kerf = state.settings.kerf, widthTolerance = 0) {
    const capacity = Number(material.length) - Math.max(0, Number(tolerance) || 0), sheetWidth = Number(material.width), usableWidth = sheetWidth - Math.max(0, Number(widthTolerance) || 0), pieces = [], cutKerf = Math.max(0, Number(kerf) || 0);
    for (const p of parts || []) if (p.materialId === material.id) {
      const count = Math.max(0, Math.min(9999, Math.floor(Number(p.quantity) || 0)));
      for (let i = 0; i < count; i++) pieces.push({ id: p.id, name: p.name?.trim() || '', length: Number(p.length), width: Number(p.width) > 0 ? Number(p.width) : sheetWidth });
    }
    const unfit = [], cuttable = [];
    for (const item of pieces) (!(capacity > 0) || !(usableWidth > 0) || !(item.length > 0) || !(item.width > 0) || ((item.width > usableWidth + 1e-8 || item.length > capacity + 1e-8) && (item.length > usableWidth + 1e-8 || item.width > capacity + 1e-8)) ? unfit : cuttable).push(item);
    cuttable.sort((a, b) => b.length * b.width - a.length * a.width || Math.max(b.length, b.width) - Math.max(a.length, a.width));
    const boards = [];
    function splitFree(board, used) {
      const next = [];
      for (const r of board.free) {
        if (used.x >= r.x + r.w || used.x + used.w <= r.x || used.y >= r.y + r.h || used.y + used.h <= r.y) { next.push(r); continue; }
        if (used.x > r.x) next.push({ x:r.x, y:r.y, w:used.x-r.x, h:r.h });
        if (used.x + used.w + cutKerf < r.x + r.w) next.push({ x:used.x+used.w+cutKerf, y:r.y, w:r.x+r.w-used.x-used.w-cutKerf, h:r.h });
        if (used.y > r.y) next.push({ x:r.x, y:r.y, w:r.w, h:used.y-r.y });
        if (used.y + used.h + cutKerf < r.y + r.h) next.push({ x:r.x, y:used.y+used.h+cutKerf, w:r.w, h:r.y+r.h-used.y-used.h-cutKerf });
      }
      board.free = next.filter((r,i) => r.w > 1e-8 && r.h > 1e-8 && !next.some((q,j) => i !== j && r.x >= q.x-1e-8 && r.y >= q.y-1e-8 && r.x+r.w <= q.x+q.w+1e-8 && r.y+r.h <= q.y+q.h+1e-8 && (q.w > r.w+1e-8 || q.h > r.h+1e-8 || j < i)));
    }
    for (const piece of cuttable) {
      let choice = null;
      for (let bi=0; bi<boards.length; bi++) for (const r of boards[bi].free) for (const rotated of [false,true]) {
        const w = rotated ? piece.length : piece.width, h = rotated ? piece.width : piece.length;
        if (w > r.w+1e-8 || h > r.h+1e-8) continue;
        const short = Math.min(r.w-w,r.h-h), long = Math.max(r.w-w,r.h-h), score = short*100000+long;
        if (!choice || score < choice.score) choice = { bi,r,w,h,rotated,score };
      }
      if (!choice) { const board = { used:0,pieces:[],free:[{x:0,y:0,w:usableWidth,h:Math.max(0,capacity)}] }; boards.push(board); choice = { bi:boards.length-1,r:board.free[0],w:piece.width,h:piece.length,rotated:false,score:0 }; if (choice.w > usableWidth+1e-8 || choice.h > capacity+1e-8) { const rotated={w:piece.length,h:piece.width}; if(rotated.w<=usableWidth+1e-8&&rotated.h<=capacity+1e-8){choice.w=rotated.w;choice.h=rotated.h;choice.rotated=true;} else {boards.pop();unfit.push(piece);continue;} } }
      const board = boards[choice.bi], used = { x:choice.r.x,y:choice.r.y,w:choice.w,h:choice.h };
      board.pieces.push({ ...piece, ...used, rotated:choice.rotated }); board.used += piece.length*piece.width; splitFree(board,used);
    }
    return { boards, unfit, capacity: Math.max(0, capacity), sheetWidth, usableWidth: Math.max(0, usableWidth) };
  }
  function requiredBoards(material) {
    const active = state.projects.filter(p => !p.archived && p.status !== 'complete');
    const parts = active.flatMap(allProjectParts), tolerance = active.reduce((max, p) => Math.max(max, Number(p.cutTolerance) || 0), 0), widthTolerance = active.reduce((max, p) => Math.max(max, Number(p.cutWidthTolerance) || 0), 0), kerf = active.reduce((max, p) => Math.max(max, Number(p.cutKerf ?? state.settings.kerf) || 0), 0);
    return optimizeCuts(material, parts, tolerance, kerf, widthTolerance).boards.length;
  }
  function commitBuildVersion(b, parts) {
    const previous = currentBuildVersion(b), number = previous ? Number(previous.number) + 1 : 1;
    // Resolve the optional “use stock width” value when saving a version so
    // later catalog edits cannot silently change that version's cut sizes.
    const frozenParts = structuredClone(parts).map(part => ({ ...part, width: Number(part.width) > 0 ? Number(part.width) : Number(stockItem(part.materialId)?.width) || undefined }));
    b.versions.push({ id: uid(), number, createdAt: new Date().toISOString(), parts: frozenParts }); b.updatedAt = new Date().toISOString();
  }
  function statusName(s) { return ({ planning: 'Planning', 'in-progress': 'In progress', paused: 'Paused', complete: 'Complete' })[s] || 'Planning'; }
  function statusBadge(s) { return featureEnabled('projectStatus') ? `<span class="status-badge ${s === 'in-progress' ? 'in-progress' : s === 'complete' ? 'complete' : s === 'paused' ? 'paused' : ''}"><i class="status-dot"></i>${statusName(s)}</span>` : ''; }
  function dateLabel(iso) { if (!iso) return 'Just now'; const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? `${days} days ago` : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function heading(eyebrow, title, sub, button = '') { return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1 class="page-title">${title}</h1>${sub ? `<p class="page-subtitle">${sub}</p>` : ''}</div>${button}</div>`; }
  function projectCard(p) { const count = projectPartCount(p); return `<article class="project-card" data-open-project="${esc(p.id)}" tabindex="0" role="button"><div class="project-card-top"><h3>${esc(p.name)}</h3>${statusBadge(p.status)}</div><p class="project-description">${esc(p.description || 'Add a description to keep the plan clear.')}</p><div class="card-footer"><span class="card-part-count">▤ ${count} ${count === 1 ? 'part' : 'parts'}</span><span>Edited ${dateLabel(p.updatedAt)}</span></div></article>`; }
  function emptyProjectState() { return `<div class="empty-state"><div class="empty-icon">✳</div><h3>Your next great build starts here</h3><p>Create a project to keep its parts, notes, and cut list together.</p><button class="button button-primary" data-action="new-project">＋ Create a project</button></div>`; }
  function availableDashboardWidgets() { return DASHBOARD_WIDGETS.filter(([id]) => (id !== 'recentBuilds' || featureEnabled('buildsMenu')) && (id !== 'cutCalculator' || featureEnabled('cutCalculator')) && (id !== 'projectStatus' || featureEnabled('projectStatus'))); }
  function renderDashboardWidget(id) {
    const projects = state.projects.filter(p => !p.archived).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')), active = projects.filter(p => p.status !== 'complete');
    if (id === 'quickActions') return `<div class="dashboard-widget-title"><div><p class="eyebrow">GET STARTED</p><h2>Quick actions</h2></div></div><div class="quick-action-grid"><button class="quick-action-card" data-action="new-project"><span>＋</span><strong>New project</strong></button><button class="quick-action-card" data-action="new-material"><span>▥</span><strong>Add material</strong></button><button class="quick-action-card" data-action="dashboard-add-parts"><span>▤</span><strong>Add parts to project</strong></button>${featureEnabled('buildsMenu') ? '<button class="quick-action-card" data-action="new-build"><span>▧</span><strong>New build</strong></button>' : ''}</div>`;
    if (id === 'projectOverview') return `<div class="dashboard-widget-title"><div><p class="eyebrow">WORK IN PROGRESS</p><h2>Project overview</h2></div><button class="text-link" data-page="projects">All projects →</button></div><div class="dashboard-overview-stats"><div><small>Active</small><strong>${active.length}</strong></div><div><small>Parts planned</small><strong>${active.reduce((sum, p) => sum + projectPartCount(p), 0)}</strong></div>${featureEnabled('projectStatus') ? `<div><small>Completed</small><strong>${projects.filter(p => p.status === 'complete').length}</strong></div>` : ''}</div><div class="dashboard-project-list">${projects.length ? projects.slice(0, 3).map(p => `<button class="dashboard-project-link" data-open-project="${esc(p.id)}"><span><strong>${esc(p.name)}</strong><small>${projectPartCount(p)} parts · edited ${dateLabel(p.updatedAt)}</small></span>${statusBadge(p.status)}<span class="settings-card-arrow">→</span></button>`).join('') : emptyProjectState()}</div>`;
    if (id === 'recentProjects') return `<div class="dashboard-widget-title"><div><p class="eyebrow">YOUR WORKSPACE</p><h2>Recent projects</h2></div><button class="text-link" data-page="projects">View all →</button></div><div class="project-grid dashboard-recent-projects">${projects.length ? projects.slice(0, 3).map(projectCard).join('') : emptyProjectState()}</div>`;
    if (id === 'recentBuilds') { const builds = state.builds.filter(b => !b.archived).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, 4); return `<div class="dashboard-widget-title"><div><p class="eyebrow">REUSABLE DESIGNS</p><h2>Recent builds</h2></div><button class="text-link" data-page="builds">All builds →</button></div><div class="dashboard-build-list">${builds.length ? builds.map(b => { const v = currentBuildVersion(b), d = b.draft; return `<button class="dashboard-build-link" data-open-build="${esc(b.id)}"><span class="project-glyph">▧</span><span><strong>${esc(b.name)}</strong><small>${buildParts(b).length} parts · ${d ? `Draft v${d.versionNumber}` : v ? `Current v${v.number}` : 'Version 1 draft'}</small></span><span class="settings-card-arrow">→</span></button>`; }).join('') : `<div class="widget-empty"><strong>No reusable builds yet</strong><span>Create a saved build to reuse it across projects.</span>${featureEnabled('buildsMenu') ? '<button class="button button-secondary button-small" data-action="new-build">＋ Create build</button>' : ''}</div>`}</div>`; }
    if (id === 'inventoryOverview') { const boards = state.materials.reduce((sum, m) => sum + (Number(m.onHand) || 0), 0), assigned = state.materials.reduce((sum, m) => sum + assignedMaterialCount(m.id), 0), planned = state.materials.reduce((sum, m) => sum + requiredBoards(m), 0); return `<div class="dashboard-widget-title"><div><p class="eyebrow">SHOP INVENTORY</p><h2>Materials overview</h2></div><button class="text-link" data-page="materials">Open materials →</button></div><div class="dashboard-overview-stats"><div><small>Stock items</small><strong>${state.materials.length}</strong></div><div><small>Boards / sheets</small><strong>${boards}</strong></div><div><small>In use</small><strong>${assigned}</strong></div><div><small>Planned</small><strong>${planned}</strong></div></div>${state.materials.length ? `<div class="dashboard-inventory-list">${state.materials.slice(0, 3).map(m => `<div><span>${esc(m.name || m.woodType)} · ${esc(displayMeasure(m.length))} ${unitName()}</span><strong>${Number(m.onHand) || 0}</strong></div>`).join('')}</div>` : '<div class="widget-empty"><strong>No materials in stock</strong><span>Add stock to see inventory at a glance.</span><button class="button button-secondary button-small" data-action="new-material">＋ Add material</button></div>'}`; }
    if (id === 'projectStatus') { const counts = ['planning', 'in-progress', 'paused', 'complete'].map(status => ({ status, count: projects.filter(p => p.status === status).length })); return `<div class="dashboard-widget-title"><div><p class="eyebrow">PROJECT STATUS</p><h2>Status overview</h2></div><button class="text-link" data-page="projects">Projects →</button></div><div class="dashboard-status-list">${counts.map(row => `<div>${statusBadge(row.status)}<strong>${row.count}</strong></div>`).join('')}</div>`; }
    if (id === 'cutCalculator') return `<div class="dashboard-widget-title"><div><p class="eyebrow">WORKSHOP TOOL</p><h2>Cut calculator</h2></div><button class="text-link" data-page="calculator">Full tool →</button></div><div class="dashboard-calc-row"><input class="field-input" inputmode="decimal" data-dashboard-calc="first" aria-label="First measurement" placeholder="First"><select class="field-select" data-dashboard-calc="operation" aria-label="Operation"><option value="add">+</option><option value="subtract">−</option></select><input class="field-input" inputmode="decimal" data-dashboard-calc="second" aria-label="Second measurement" placeholder="Second"><button class="button button-primary button-small" data-action="dashboard-calculate">Calculate</button></div><div class="dashboard-calc-result" data-dashboard-calc-result>Result will use ${unitName()}.</div>`;
    return '';
  }
  function renderDashboardWidgetFrame(id, index) {
    const descriptor = DASHBOARD_WIDGETS.find(row => row[0] === id); if (!descriptor) return '';
    const controls = dashboardEditMode ? `<div class="dashboard-widget-edit-controls"><button class="dashboard-drag-handle" type="button" draggable="true" data-widget-drag="${esc(id)}" aria-label="Drag to move ${esc(descriptor[1])}">⠿ Move</button><button type="button" data-action="move-dashboard-widget-up" data-widget-id="${esc(id)}" aria-label="Move ${esc(descriptor[1])} up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-action="move-dashboard-widget-down" data-widget-id="${esc(id)}" aria-label="Move ${esc(descriptor[1])} down" ${index === state.settings.dashboardWidgets.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-action="remove-dashboard-widget" data-widget-id="${esc(id)}" aria-label="Remove ${esc(descriptor[1])}">Remove</button></div>` : '';
    return `<section class="dashboard-widget dashboard-widget-${esc(id)}" data-dashboard-widget="${esc(id)}"><header class="dashboard-widget-edit-bar">${dashboardEditMode ? `<span>${esc(descriptor[1])}</span>${controls}` : ''}</header><div class="dashboard-widget-content">${renderDashboardWidget(id)}</div></section>`;
  }
  function renderDashboard() {
    const widgets = state.settings.dashboardWidgets.filter(id => availableDashboardWidgets().some(row => row[0] === id));
    const widgetLibrary = availableDashboardWidgets().filter(([id]) => !widgets.includes(id)).map(([id, name, description]) => `<button class="dashboard-library-card" data-action="add-dashboard-widget" data-widget-id="${esc(id)}"><strong>＋ ${esc(name)}</strong><small>${esc(description)}</small></button>`).join('');
    return `<section class="welcome-banner"><div class="banner-content"><p class="eyebrow">YOUR WORKSPACE</p><h1 class="banner-title">A good plan makes<br>good sawdust.</h1><p class="banner-copy">${BRAND.tagline} Keep every project, part, and measurement in one place.</p><button class="button banner-cta" data-action="new-project">＋ Start a project</button></div></section><div class="dashboard-customize-bar"><div><p class="eyebrow">YOUR WORKSPACE</p><h2>Dashboard</h2></div><button class="button ${dashboardEditMode ? 'button-primary' : 'button-secondary'}" data-action="toggle-dashboard-edit">${dashboardEditMode ? 'Done customizing' : 'Customize dashboard'}</button></div>${dashboardEditMode ? `<section class="dashboard-widget-library"><div><strong>Widget library</strong><small>Add the information and tools you want on this dashboard.</small></div><div class="dashboard-library-grid">${widgetLibrary || '<span class="subtle">All available widgets are on your dashboard.</span>'}</div></section>` : ''}<div class="dashboard-grid ${dashboardEditMode ? 'is-editing' : ''}">${widgets.length ? widgets.map(renderDashboardWidgetFrame).join('') : `<div class="dashboard-empty"><strong>Your dashboard is ready to personalize</strong><span>Add a widget from the library to get started.</span><button class="button button-secondary button-small" data-action="toggle-dashboard-edit">Choose widgets</button></div>`}</div>`;
  }
  function renderToolbox() {
    if (currentToolId) {
      const tool = TOOLBOX_TOOLS.find(([id]) => id === currentToolId);
      if (tool) return `<button class="text-link detail-back" data-action="toolbox-home">← All tools</button>${renderToolboxWorkspace(tool)}`;
      currentToolId = null;
    }
    const ordered = state.settings.toolboxTools.filter(id => TOOLBOX_TOOLS.some(tool => tool[0] === id) && (id !== 'cutCalculator' || featureEnabled('cutCalculator')));
    const cards = ordered.map((id, index) => {
      const [toolId, name, description, icon] = TOOLBOX_TOOLS.find(tool => tool[0] === id);
      const controls = toolboxEditMode ? `<div class="toolbox-card-controls"><button type="button" data-action="move-tool-up" data-tool-id="${esc(id)}" aria-label="Move ${esc(name)} up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-action="move-tool-down" data-tool-id="${esc(id)}" aria-label="Move ${esc(name)} down" ${index === ordered.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-action="hide-tool" data-tool-id="${esc(id)}">Hide</button></div>` : '';
      return `<article class="toolbox-card" data-tool-card="${esc(id)}"><div class="toolbox-card-top"><span class="toolbox-icon" aria-hidden="true">${esc(icon)}</span>${toolboxEditMode ? `<button type="button" class="toolbox-drag-handle" draggable="true" data-tool-drag="${esc(id)}" aria-label="Drag to move ${esc(name)}">⠿</button>` : ''}</div><h2>${esc(name)}</h2><p>${esc(description)}</p><div class="toolbox-card-bottom"><button type="button" class="toolbox-open" data-open-tool="${esc(toolId)}">Open tool <span aria-hidden="true">→</span></button>${controls}</div></article>`;
    }).join('');
    const hidden = TOOLBOX_TOOLS.filter(([id]) => !ordered.includes(id) && (id !== 'cutCalculator' || featureEnabled('cutCalculator')));
    const library = toolboxEditMode ? `<section class="toolbox-library"><div><strong>Hidden tools</strong><small>Restore a tool to put it back in your Toolbox.</small></div>${hidden.length ? hidden.map(([id, name, description]) => `<button class="toolbox-restore" data-action="restore-tool" data-tool-id="${esc(id)}"><strong>＋ ${esc(name)}</strong><small>${esc(description)}</small></button>`).join('') : '<span class="subtle">All available tools are visible.</span>'}</section>` : '';
    return `${heading('YOUR WORKSPACE', 'Toolbox', 'Handy tools for planning and working in your shop.', `<div class="toolbox-heading-actions">${toolboxEditMode ? '<button class="button button-secondary" data-action="reset-toolbox">Reset layout</button>' : ''}<button class="button ${toolboxEditMode ? 'button-primary' : 'button-secondary'}" data-action="toggle-toolbox-edit">${toolboxEditMode ? 'Done customizing' : 'Customize Toolbox'}</button></div>`)}${toolboxEditMode ? `<div class="toolbox-customize-note">Drag to reorder on desktop, or use the arrow buttons. Hiding a tool never removes its data.</div>` : ''}${library}<div class="toolbox-grid">${cards || '<div class="empty-state"><h3>Your Toolbox is empty</h3><p>Restore a hidden tool from the library below.</p></div>'}</div>${!toolboxEditMode ? '<p class="toolbox-next">More workshop tools will appear here as they are added.</p>' : ''}`;
  }
  function renderProjects() {
    const all = [...state.projects].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const visibleSet = all.filter(p => projectVisibilityFilter === 'archived' ? p.archived : !p.archived);
    const shown = visibleSet.filter(p => (!featureEnabled('projectStatus') || projectStatusFilter === 'all' || p.status === projectStatusFilter) && `${p.name} ${p.description || ''}`.toLowerCase().includes(projectSearch.toLowerCase()));
    const list = shown.map(p => `<article class="project-row" data-open-project="${esc(p.id)}" tabindex="0" role="button"><div class="project-row-left"><div class="project-glyph">▤</div><div><div class="project-row-title">${esc(p.name)}</div><div class="project-row-desc">${esc(p.description || 'No description')}</div></div></div><div class="project-row-right">${statusBadge(p.status)}<span class="subtle">${projectPartCount(p)} parts</span><span class="subtle">${dateLabel(p.updatedAt)}</span> ›</div></article>`).join('');
    return `${heading('YOUR WORKSPACE', 'Projects', `${visibleSet.length} ${visibleSet.length === 1 ? 'project' : 'projects'}${projectVisibilityFilter === 'archived' ? ' archived' : ' in your workshop'}`, '<button class="button button-primary" data-action="new-project">＋ New project</button>')}<div class="list-toolbar"><input id="project-search" class="search-input" type="search" placeholder="Search projects…" value="${esc(projectSearch)}"><select id="visibility-filter" class="filter-select"><option value="active" ${projectVisibilityFilter === 'active' ? 'selected' : ''}>Current projects</option><option value="archived" ${projectVisibilityFilter === 'archived' ? 'selected' : ''}>Archived projects</option></select>${featureEnabled('projectStatus') ? `<select id="status-filter" class="filter-select"><option value="all">All statuses</option>${['planning', 'in-progress', 'paused', 'complete'].map(s => `<option value="${s}" ${s === projectStatusFilter ? 'selected' : ''}>${statusName(s)}</option>`).join('')}</select>` : ''}</div><div class="project-list">${list || `<div class="empty-state"><h3>${visibleSet.length ? 'No matching projects' : projectVisibilityFilter === 'archived' ? 'No archived projects' : 'Make room for your next project'}</h3><p>${visibleSet.length ? 'Try another search or status.' : 'Create a project to keep its parts and notes together.'}</p>${visibleSet.length ? '<button class="button button-secondary" data-action="clear-filters">Clear filters</button>' : '<button class="button button-primary" data-action="new-project">＋ Create a project</button>'}</div>`}</div>`;
  }
  function renderBuilds() {
    if (currentBuildId && build(currentBuildId)) {
      return renderBuildDetail(build(currentBuildId));
    }
    const rows = [...state.builds].sort((a, z) => String(z.updatedAt || '').localeCompare(String(a.updatedAt || ''))).map(b => {
      const version = currentBuildVersion(b), draft = b.draft, parts = buildParts(b), count = parts.length;
      const badge = draft ? `<span class="version-badge draft-badge">Draft · v${draft.versionNumber}</span>` : version ? `<span class="version-badge">Current · v${version.number}</span>` : '<span class="version-badge draft-badge">Draft · v1</span>';
      return `<article class="build-card" data-open-build="${esc(b.id)}" tabindex="0" role="button"><div class="build-card-main"><div class="project-glyph">▧</div><div><div class="project-row-title">${esc(b.name)} ${b.archived ? '<span class="status-badge complete">Archived</span>' : ''}</div><div class="project-row-desc">${esc(b.description || 'Reusable workshop design')}</div></div></div><div class="build-card-meta">${badge}<span>${count} ${count === 1 ? 'part' : 'parts'}</span></div></article>`;
    }).join('');
    return `${heading('REUSABLE DESIGNS', 'Builds', 'Save repeatable assemblies and add a chosen version to any project.', '<button class="button button-primary" data-action="new-build">＋ New build</button>')}<div class="build-list">${rows || `<div class="empty-state"><div class="empty-icon">▧</div><h3>No saved builds yet</h3><p>Create a build for a repeatable assembly, then reuse it across projects.</p><button class="button button-primary" data-action="new-build">＋ Create a build</button></div>`}</div>`;
  }
  function renderBuildDetail(b) {
    const current = currentBuildVersion(b), draft = b.draft, parts = buildParts(b);
    const rows = parts.map((part, i) => { const material = stockItem(part.materialId); return `<tr><td class="part-name">${esc(part.name || `Part ${i + 1}`)}${part.notes ? `<small class="part-note">${esc(part.notes)}</small>` : ''}</td><td>${Number(part.quantity) || 1}</td><td class="dimension">${displayMeasure(part.length)}</td><td class="dimension">${displayMeasure(part.width || material?.width)}</td><td>${esc(material ? stockLabel(material) : part.material || '—')}</td><td class="part-actions"><button class="button button-quiet button-small" data-action="edit-build-part" data-id="${esc(part.id)}">Edit</button><button class="button button-quiet button-small" data-action="delete-build-part" data-id="${esc(part.id)}" aria-label="Delete ${esc(part.name || 'part')}">×</button></td></tr>`; }).join('');
    const materialIds = [...new Set(parts.map(part => part.materialId).filter(Boolean))], plans = materialIds.map(id => { const item = stockItem(id); return item ? { item, ...optimizeCuts(item, parts, 0, state.settings.kerf) } : null; }).filter(Boolean);
    const requirementRows = plans.map(plan => `<tr><td>${esc(stockLabel(plan.item))}</td><td>${plan.boards.length} ${materialKind(plan.item) === 'plywood' ? 'sheets' : 'boards'}</td><td>${plan.unfit.length ? `${plan.unfit.length} cut(s) do not fit` : 'Cuts fit'}</td></tr>`).join('');
    const cutCards = plans.flatMap(plan => plan.boards.map((board, i) => { const groups = new Map(); for (const piece of board.pieces) { const key = `${piece.name}|${piece.length}|${piece.width}`; const group = groups.get(key) || { ...piece, quantity: 0 }; group.quantity++; groups.set(key, group); } return `<article class="build-cut-board"><strong>${esc(plan.item.woodType)} · ${displayMeasure(plan.item.length)} × ${displayMeasure(plan.item.width)} · board ${i + 1}</strong><ul>${[...groups.values()].map(piece => `<li>${piece.quantity} × ${displayMeasure(piece.length)} × ${displayMeasure(piece.width)} — ${esc(piece.name || 'Unnamed part')}${piece.rotated ? ' · rotated' : ''}</li>`).join('')}</ul></article>`; })).join('');
    const missingStock = parts.filter(part => !part.materialId || !stockItem(part.materialId)).length, unfitCuts = plans.reduce((sum, plan) => sum + plan.unfit.length, 0);
    const history = [...(b.versions || [])].sort((a, z) => z.number - a.number).map(v => `<li><details class="version-history-item"><summary><span class="version-badge">v${v.number}${v.id === current?.id ? ' · Latest finalized' : ''}</span><span>${(v.parts || []).length} ${(v.parts || []).length === 1 ? 'part' : 'parts'}</span><span class="subtle">${dateLabel(v.createdAt)}</span></summary><ul>${(v.parts || []).map(part => { const material = stockItem(part.materialId); return `<li>${esc(part.name || 'Unnamed part')} · qty ${Number(part.quantity) || 1} · ${displayMeasure(part.length)} × ${displayMeasure(part.width || material?.width)} · ${esc(material?.woodType || part.material || 'No stock selected')}</li>`; }).join('') || '<li>Empty design</li>'}</ul></details></li>`).join('');
    const users = state.projects.flatMap(p => (p.builds || []).filter(ref => ref.buildId === b.id).map(ref => `<li>${esc(p.name)} · v${ref.versionNumber} · qty ${ref.quantity}</li>`)).join('');
    const versionNumber = draft?.versionNumber || (current ? Number(current.number) + 1 : 1);
    const designTitle = draft ? `Version ${draft.versionNumber} draft` : current ? `Finalized version ${current.number}` : 'Version 1 draft';
    const designCopy = draft ? `Edits stay in this draft. Save it as a checkpoint, then finalize v${draft.versionNumber} when the design is ready.` : current ? 'This version is locked. Start editing to make a draft for the next version; projects keep their pinned versions.' : 'Add parts to create the version 1 draft. Parts can be changed freely until you finalize it.';
    const versionActions = draft ? `<button class="button button-secondary button-small" data-action="save-build-draft" ${draft.dirty ? '' : 'disabled'}>${draft.dirty ? 'Save draft' : 'Draft saved'}</button><button class="button button-primary button-small" data-action="finalize-build-version">Finalize v${draft.versionNumber}</button>` : current ? `<button class="button button-secondary button-small" data-action="start-build-edit">Edit as v${versionNumber}</button>` : '';
    return `<button class="text-link detail-back" data-page="builds">← Back to builds</button><section class="detail-top"><div><p class="eyebrow">${draft ? 'WORKING DRAFT' : current ? 'LATEST FINALIZED VERSION' : 'NEW BUILD'} <span class="version-badge ${draft || !current ? 'draft-badge' : ''}">${draft ? `Draft · v${draft.versionNumber}` : current ? `v${current.number}` : 'Draft · v1'}</span></p><h1 class="detail-title">${esc(b.name)}</h1><p class="detail-copy">${esc(b.description || 'No description yet.')}</p><p class="panel-subtitle">Projects keep the version they selected until you update that project explicitly.${draft ? ` Draft based on ${draft.baseVersionId ? `v${Number(draft.versionNumber) - 1}` : 'a new build'}${draft.dirty ? ' · changes since last save' : ' · saved draft'}.` : ''}</p></div><div class="detail-actions"><button class="button button-secondary button-small" data-action="edit-build" data-id="${esc(b.id)}">Edit details</button><button class="button button-secondary button-small" data-action="duplicate-build" data-id="${esc(b.id)}" ${current ? '' : 'disabled'}>Duplicate</button><button class="button button-secondary button-small" data-action="archive-build" data-id="${esc(b.id)}">${b.archived ? 'Restore build' : 'Archive build'}</button></div></section><section class="detail-panel"><div class="detail-panel-header"><div><h2 class="detail-panel-title">${designTitle}</h2><p class="panel-subtitle">${designCopy}</p></div><div class="detail-actions">${versionActions}<button class="button button-primary button-small" data-action="new-build-part" data-id="${esc(b.id)}">＋ Add part</button></div></div>${parts.length ? `<div style="overflow-x:auto"><table class="part-table"><thead><tr><th>Part</th><th>Qty / unit</th><th>Length</th><th>Width</th><th>Material</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="coming-soon"><div><strong>No parts in this draft</strong>Add parts to define this reusable build.</div></div>'}</section><section class="detail-panel"><div class="detail-panel-header"><div><h2 class="detail-panel-title">Materials and cut list · one build unit</h2><p class="panel-subtitle">Preview uses the default kerf. Each project applies its own kerf and quantity. Only finalized versions can be added to projects.</p></div></div>${requirementRows ? `<div class="project-material-table-wrap"><table class="project-material-table"><thead><tr><th>Stock material</th><th>Boards / sheets</th><th>Fit</th></tr></thead><tbody>${requirementRows}</tbody></table></div>` : '<p class="panel-subtitle">Assign stock to build parts to calculate material requirements.</p>'}${missingStock ? `<p class="material-warning">${missingStock} part${missingStock === 1 ? ' needs' : 's need'} a stock assignment.</p>` : ''}${cutCards ? `<div class="build-cut-list">${cutCards}</div>` : ''}${unfitCuts ? `<p class="material-warning">${unfitCuts} cut(s) do not fit the selected stock.</p>` : ''}</section><div class="build-history-grid"><section class="detail-panel build-version-history-panel"><h2 class="detail-panel-title">Finalized version history</h2>${history ? `<ul class="build-history">${history}</ul>` : '<p class="panel-subtitle">No finalized versions yet.</p>'}</section><section class="detail-panel"><h2 class="detail-panel-title">Used in projects</h2>${users ? `<ul class="build-history">${users}</ul>` : '<p class="panel-subtitle">This build has not been added to a project yet.</p>'}</section></div>`;
  }
  function renderMaterials() {
    const visible = state.materials.filter(m => (materialTypeFilter === 'all' || materialKind(m) === materialTypeFilter) && (materialThicknessFilter === 'all' || Number(m.thickness) === Number(materialThicknessFilter)));
    const groups = new Map();
    for (const m of visible) {
      const kind = materialKind(m), key = kind === 'plywood'
        ? `plywood|${Number(m.thickness).toFixed(4)}`
        : `${kind}|${String(m.woodType || '').toLowerCase()}|${Number(m.thickness).toFixed(4)}|${Number(m.width).toFixed(4)}`;
      if (!groups.has(key)) groups.set(key, { key, kind, woodType: m.woodType, thickness: m.thickness, width: m.width, items: [] });
      groups.get(key).items.push(m);
    }
    const metrics = material => {
      const planned = requiredBoards(material), have = Number(material.onHand) || 0;
      return { planned, buy: Math.max(0, planned - have), have, assigned: assignedMaterialCount(material.id), free: Math.max(0, have - assignedMaterialCount(material.id)) };
    };
    const totalHave = state.materials.reduce((sum, m) => sum + (Number(m.onHand) || 0), 0);
    const totalPlanned = state.materials.reduce((sum, m) => sum + metrics(m).planned, 0);
    const totalBuy = state.materials.reduce((sum, m) => sum + metrics(m).buy, 0);
    const groupLabel = group => group.kind === 'plywood'
      ? `Plywood · ${displayMeasure(group.thickness)} thick`
      : `${group.woodType} · ${displayMeasure(group.thickness)} thick × ${displayMeasure(group.width)} wide`;
    const blocks = [...groups.values()]
      .sort((a, b) => a.kind.localeCompare(b.kind) || String(a.woodType).localeCompare(String(b.woodType)) || a.thickness - b.thickness || (a.width || 0) - (b.width || 0))
      .map(group => {
        const groupPlanned = group.items.reduce((sum, item) => sum + metrics(item).planned, 0);
        const groupBuy = group.items.reduce((sum, item) => sum + metrics(item).buy, 0);
        const cards = group.items.slice().sort((a, b) => a.length - b.length || String(a.name || '').localeCompare(String(b.name || ''))).map(item => {
          const { planned, buy, have, assigned, free } = metrics(item), unit = group.kind === 'plywood' ? 'sheets' : 'boards';
          return `<article class="stock-item-card"><div class="stock-item-heading"><div><h3>${esc(item.name?.trim() || item.woodType)}</h3><p>${esc(item.woodType)} · ${displayMeasure(item.length)} long × ${displayMeasure(item.width)} wide × ${displayMeasure(item.thickness)} thick</p></div><div class="stock-actions"><button class="text-link" data-action="edit-material" data-id="${esc(item.id)}">Edit</button><button class="text-link stock-delete" data-action="delete-material" data-id="${esc(item.id)}" aria-label="Delete ${esc(item.name || item.woodType)}">×</button></div></div><div class="stock-item-metrics"><label class="stock-metric stock-have"><span>Have (${unit})</span><input class="stock-count" type="number" min="0" max="9999" value="${have}" data-stock-count="${esc(item.id)}" aria-label="${unit} on hand"></label><div class="stock-metric"><span>Assigned</span><strong>${assigned}</strong></div><div class="stock-metric"><span>Free</span><strong class="${assigned > have ? 'shortage-text' : ''}">${free}${assigned > have ? ' · over' : ''}</strong></div><div class="stock-metric stock-planned"><span>Planned</span><strong>${planned} ${unit}</strong></div><div class="stock-metric stock-buy ${buy ? 'stock-buy-needed' : ''}"><span>Buy</span><strong class="${buy ? 'shortage-text' : 'stock-good-text'}">${buy ? `${buy} ${unit}` : '0'}</strong></div></div></article>`;
        }).join('');
        const unit = group.kind === 'plywood' ? 'sheets' : 'boards';
        return `<details class="stock-group" data-stock-group="${esc(group.key)}"><summary class="stock-group-summary"><span class="stock-group-title"><strong>${esc(groupLabel(group))}</strong><small>${group.items.length} stock ${group.items.length === 1 ? 'item' : 'items'}</small></span><span class="stock-group-totals"><span><small>Planned · ${unit}</small><strong>${groupPlanned}</strong></span><span class="${groupBuy ? 'group-buy-needed' : ''}"><small>Buy · ${unit}</small><strong>${groupBuy}</strong></span><span class="stock-chevron" aria-hidden="true">⌄</span></span></summary><div class="stock-group-content">${cards}</div></details>`;
      }).join('');
    const thicknesses = [...new Set(state.materials.map(m => Number(m.thickness)))].sort((a,b)=>a-b);
    return `<div class="materials-page">${heading('YOUR WORKSPACE', 'Materials', 'Track stock, project assignments, and purchase quantities.', '<button class="button button-primary" data-action="new-material">＋ Add material</button>')}<section class="stock-summary"><div class="stat-card"><div class="stat-label">Stock items</div><div class="stat-value">${state.materials.length}</div></div><div class="stat-card"><div class="stat-label">Boards / sheets on hand</div><div class="stat-value">${totalHave}</div></div><div class="stat-card"><div class="stat-label">Planned for projects</div><div class="stat-value">${totalPlanned}</div></div><div class="stat-card"><div class="stat-label">Boards / sheets to buy</div><div class="stat-value ${totalBuy ? 'need-value' : ''}">${totalBuy}</div></div></section><div class="material-filters"><label>Type <select class="filter-select" data-material-type-filter><option value="all">All types</option><option value="lumber" ${materialTypeFilter==='lumber'?'selected':''}>Lumber</option><option value="plywood" ${materialTypeFilter==='plywood'?'selected':''}>Plywood</option><option value="other" ${materialTypeFilter==='other'?'selected':''}>Other wood</option></select></label><label>Thickness / height <select class="filter-select" data-material-thickness-filter><option value="all">All thicknesses</option>${thicknesses.map(t=>`<option value="${t}" ${String(t)===materialThicknessFilter?'selected':''}>${displayMeasure(t)}</option>`).join('')}</select></label></div><div class="stock-groups">${blocks || `<div class="empty-state"><h3>${state.materials.length ? 'No stock matches these filters' : 'No materials yet'}</h3><p>${state.materials.length ? 'Try another material type or thickness.' : 'Add lumber and sheet stock. Project parts use these materials to calculate needs.'}</p>${state.materials.length ? '' : '<button class="button button-primary" data-action="new-material">＋ Add material</button>'}</div>`}</div><p class="stock-footnote">“Planned” is the number of boards or sheets required by active project cut lists. “Assigned” reserves pieces for a project and “Free” shows the unreserved on-hand count. Buy is the estimated shortfall; cut requirements are pooled across unfinished projects where compatible stock is shared. Offcuts are not tracked as inventory.</p></div>`;
  }
  function renderCalculator() {
    const frac = state.settings.numberFormat === 'fraction' && state.settings.units === 'inches';
    return `${heading('WORKSHOP TOOLS', 'Cut calculator', `Add or subtract shop measurements in ${unitName()}.`)}<section class="calculator-panel"><div class="calc-content"><div><div class="field"><label class="field-label" for="calc-first">First measurement (${unitName()})</label><input class="field-input" id="calc-first" placeholder="${state.settings.units === 'metric' ? '285.75' : frac ? '11 1/4″' : '11.25'}"></div><div class="field"><label class="field-label" for="calc-operation">Operation</label><select id="calc-operation" class="field-select"><option value="add">Add (+)</option><option value="subtract">Subtract (−)</option></select></div><div class="field"><label class="field-label" for="calc-second">Second measurement (${unitName()})</label><input class="field-input" id="calc-second" placeholder="${state.settings.units === 'metric' ? '19.05' : frac ? '3/4″' : '0.75'}"></div><button class="button button-primary" data-action="calculate">Calculate</button></div><div class="calc-output"><p class="eyebrow">RESULT</p><div id="calc-result" class="calc-result">—</div><div id="calc-decimal" class="subtle">Enter two measurements to start</div><div class="cut-list-note">Results display in ${unitName()}.</div></div></div></section>`;
  }
  const CONVERSION_UNITS = {
    length: [['in', 'Inches', 0.0254], ['ft', 'Feet', 0.3048], ['yd', 'Yards', 0.9144], ['mi', 'Miles', 1609.344], ['mm', 'Millimeters', 0.001], ['cm', 'Centimeters', 0.01], ['m', 'Meters', 1]],
    area: [['in2', 'Square inches', 0.00064516], ['ft2', 'Square feet', 0.09290304], ['yd2', 'Square yards', 0.83612736], ['mm2', 'Square millimeters', 0.000001], ['cm2', 'Square centimeters', 0.0001], ['m2', 'Square meters', 1]],
    volume: [['in3', 'Cubic inches', 0.000016387064], ['ft3', 'Cubic feet', 0.028316846592], ['yd3', 'Cubic yards', 0.764554857984], ['ml', 'Milliliters', 0.000001], ['l', 'Liters', 0.001], ['m3', 'Cubic meters', 1]],
    weight: [['g', 'Grams', 0.001], ['kg', 'Kilograms', 1], ['oz', 'Ounces', 0.028349523125], ['lb', 'Pounds', 0.45359237], ['ton', 'US tons', 907.18474]]
  };
  function toolboxUnitOptions(category, selected) {
    if (category === 'temperature') return [['C', 'Celsius'], ['F', 'Fahrenheit']].map(([id, name]) => `<option value="${id}" ${selected === id ? 'selected' : ''}>${name}</option>`).join('');
    return (CONVERSION_UNITS[category] || []).map(([id, name]) => `<option value="${id}" ${selected === id ? 'selected' : ''}>${name}</option>`).join('');
  }
  function formatDuration(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000)), hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  function timerRemaining(timer, now = Date.now()) { return timer.endsAt ? Math.max(0, timer.endsAt - now) : Math.max(0, timer.remainingMs); }
  function renderToolboxWorkspace(tool) {
    const type = tool[4];
    if (type === 'calculator') return renderCalculator();
    if (type === 'timers') {
      const clock = state.settings.toolboxTimers, elapsed = clock.stopwatch.elapsedMs + (clock.stopwatch.startedAt ? Math.max(0, Date.now() - clock.stopwatch.startedAt) : 0);
      const timerRows = clock.timers.map(timer => { const left = timerRemaining(timer), running = !!timer.endsAt && left > 0; return `<article class="toolbox-timer-row ${left === 0 ? 'is-finished' : ''}" data-timer-row="${esc(timer.id)}"><div><strong>${esc(timer.name)}</strong><span class="toolbox-timer-display" data-timer-display="${esc(timer.id)}">${formatDuration(left)}</span><small data-timer-status>${left === 0 ? 'Finished' : running ? 'Running' : 'Paused'}</small></div><div class="toolbox-timer-actions"><button class="button button-secondary button-small" data-action="toggle-shop-timer" data-id="${esc(timer.id)}">${running ? 'Pause' : left === 0 ? 'Restart' : 'Start'}</button><button class="button button-secondary button-small" data-action="reset-shop-timer" data-id="${esc(timer.id)}">Reset</button><button class="button button-quiet button-small" data-action="delete-shop-timer" data-id="${esc(timer.id)}" aria-label="Delete ${esc(timer.name)}">×</button></div></article>`; }).join('');
      return `${heading('TOOLBOX', tool[1], tool[2])}<section class="calculator-panel toolbox-tool" data-tool-type="timers"><div class="stopwatch-panel"><div><p class="eyebrow">STOPWATCH</p><strong class="stopwatch-display" data-stopwatch-display>${formatDuration(elapsed)}</strong></div><div class="detail-actions"><button class="button button-primary button-small" data-action="toggle-stopwatch">${clock.stopwatch.startedAt ? 'Pause' : 'Start'}</button><button class="button button-secondary button-small" data-action="reset-stopwatch">Reset</button></div></div><div class="toolbox-timer-section"><div class="detail-panel-header"><div><h2 class="detail-panel-title">Multi-timer</h2><p class="panel-subtitle">Timers continue accurately when you navigate away or reopen BenchPilot.</p></div></div><form class="toolbox-timer-create" data-create-timer><label class="toolbox-field">Timer name<input class="field-input" name="name" maxlength="60" placeholder="Glue-up"></label><label class="toolbox-field">Hours<input class="field-input" name="hours" type="number" min="0" max="168" value="0"></label><label class="toolbox-field">Minutes<input class="field-input" name="minutes" type="number" min="0" max="59" value="5"></label><label class="toolbox-field">Seconds<input class="field-input" name="seconds" type="number" min="0" max="59" value="0"></label><button class="button button-primary" type="submit">＋ Add timer</button></form><div class="toolbox-timer-list">${timerRows || '<div class="widget-empty"><strong>No timers running</strong><span>Add a timer for glue, finish, or any shop task.</span></div>'}</div></div></section>`;
    }
    if (type === 'converter') return `${heading('TOOLBOX', tool[1], tool[2])}<section class="calculator-panel toolbox-tool" data-tool-type="converter"><div class="toolbox-input-grid"><label class="toolbox-field">Category<select class="field-select" data-tool-field="category"><option value="length">Length</option><option value="area">Area</option><option value="volume">Volume</option><option value="weight">Weight</option><option value="temperature">Temperature</option></select></label><label class="toolbox-field">Value<input class="field-input" inputmode="decimal" data-tool-field="value" value="1"></label><label class="toolbox-field">From<select class="field-select" data-tool-field="from">${toolboxUnitOptions('length', 'in')}</select></label><label class="toolbox-field">To<select class="field-select" data-tool-field="to">${toolboxUnitOptions('length', 'mm')}</select></label></div><div class="toolbox-result" data-tool-result>25.4 mm</div><button type="button" class="button button-secondary button-small toolbox-copy-result" data-action="copy-tool-result">Copy result</button></section>`;
    if (type === 'areaVolume') return `${heading('TOOLBOX', tool[1], tool[2])}<section class="calculator-panel toolbox-tool" data-tool-type="areaVolume"><div class="toolbox-input-grid"><label class="toolbox-field">Preset<select class="field-select" data-tool-field="preset"><option value="custom">Custom</option><option value="room">Room / floor</option><option value="wall">Wall / surface</option><option value="box">Box / container</option></select></label><label class="toolbox-field">Calculation<select class="field-select" data-tool-field="mode"><option value="area">Area · length × width</option><option value="volume">Volume · length × width × height</option></select></label><label class="toolbox-field">Dimension unit<select class="field-select" data-tool-field="dimensionUnit">${toolboxUnitOptions('length', state.settings.units === 'metric' ? 'mm' : 'in')}</select></label><label class="toolbox-field">Length<input class="field-input" inputmode="decimal" data-tool-field="length"></label><label class="toolbox-field">Width<input class="field-input" inputmode="decimal" data-tool-field="width"></label><label class="toolbox-field toolbox-height-field" hidden>Height<input class="field-input" inputmode="decimal" data-tool-field="height"></label></div><div class="toolbox-result" data-tool-result>Enter dimensions to calculate.</div><button type="button" class="button button-secondary button-small toolbox-copy-result" data-action="copy-tool-result">Copy result</button></section>`;
    if (type === 'angle') return `${heading('TOOLBOX', tool[1], tool[2])}<section class="calculator-panel toolbox-tool" data-tool-type="angle"><div class="toolbox-input-grid"><label class="toolbox-field">Calculation<select class="field-select" data-tool-field="mode"><option value="rise">Rise and run</option><option value="complement">Complementary angle</option><option value="supplement">Supplementary angle</option><option value="triangle">Missing triangle angle</option></select></label><label class="toolbox-field angle-rise-field">Rise (${unitName()})<input class="field-input" inputmode="decimal" data-tool-field="rise"></label><label class="toolbox-field angle-run-field">Run (${unitName()})<input class="field-input" inputmode="decimal" data-tool-field="run"></label><label class="toolbox-field angle-primary-field" hidden>Angle (degrees)<input class="field-input" inputmode="decimal" data-tool-field="angle"></label><label class="toolbox-field angle-secondary-field" hidden>Second angle (degrees)<input class="field-input" inputmode="decimal" data-tool-field="angle2"></label></div><div class="toolbox-result" data-tool-result>Enter rise and run to calculate slope.</div><button type="button" class="button button-secondary button-small toolbox-copy-result" data-action="copy-tool-result">Copy result</button><div class="toolbox-angle-visual" data-angle-visual aria-hidden="true"><svg viewBox="0 0 160 90"><path d="M18 72H140M18 72L112 20"/><path d="M43 72A25 25 0 0 0 40 60" class="angle-arc"/><text x="48" y="61">θ</text></svg></div></section>`;
    if (type === 'weight') return `${heading('TOOLBOX', tool[1], tool[2])}<section class="calculator-panel toolbox-tool" data-tool-type="weight"><div class="toolbox-input-grid"><label class="toolbox-field">Item weight<input class="field-input" inputmode="decimal" data-tool-field="itemWeight"></label><label class="toolbox-field">Weight unit<select class="field-select" data-tool-field="unit"><option value="g">Grams</option><option value="kg">Kilograms</option><option value="oz">Ounces</option><option value="lb">Pounds</option></select></label><label class="toolbox-field">Quantity<input class="field-input" inputmode="numeric" data-tool-field="quantity" value="1"></label><label class="toolbox-field">Container / tare weight<input class="field-input" inputmode="decimal" data-tool-field="tare" value="0"></label><label class="toolbox-field">Target total weight<input class="field-input" inputmode="decimal" data-tool-field="target"></label></div><div class="toolbox-result" data-tool-result>Enter an item weight to estimate totals.</div><button type="button" class="button button-secondary button-small toolbox-copy-result" data-action="copy-tool-result">Copy result</button></section>`;
    return `<div class="coming-soon"><div><strong>This tool is not available yet</strong>Please return to the Toolbox.</div></div>`;
  }
  function toolboxField(root, name) { return root.querySelector(`[data-tool-field="${name}"]`); }
  function unitById(category, id) { return (CONVERSION_UNITS[category] || []).find(unit => unit[0] === id); }
  function temperatureConvert(value, from, to) {
    const celsius = from === 'F' ? (value - 32) * 5 / 9 : value;
    return to === 'F' ? celsius * 9 / 5 + 32 : celsius;
  }
  function updateToolboxResult(root) {
    const tool = root.querySelector('.toolbox-tool'); if (!tool) return;
    const result = $('[data-tool-result]', tool); if (!result) return;
    const value = key => { const field = toolboxField(tool, key); if (!field || !String(field.value).trim()) return null; const parsed = parseMeasurement(field.value); return parsed === null ? null : parsed; };
    if (tool.dataset.toolType === 'converter') {
      const category = toolboxField(tool, 'category').value, number = value('value'), from = toolboxField(tool, 'from').value, to = toolboxField(tool, 'to').value;
      if (number === null) { result.textContent = 'Enter a valid value to convert.'; return; }
      let converted;
      if (category === 'temperature') converted = temperatureConvert(number, from, to);
      else { const source = unitById(category, from), target = unitById(category, to); if (!source || !target) { result.textContent = 'Choose units from the same measurement category.'; return; } converted = number * source[2] / target[2]; }
      const display = category === 'length' && to === 'in' && state.settings.units === 'inches' && state.settings.numberFormat === 'fraction' ? fraction(converted) : roundText(converted, 6);
      const suffix = category === 'temperature' ? `°${to}` : unitById(category, to)?.[1] || to;
      result.textContent = `${display} ${suffix}`;
      return;
    }
    if (tool.dataset.toolType === 'areaVolume') {
      const mode = toolboxField(tool, 'mode').value, a = value('length'), b = value('width'), c = value('height');
      $('.toolbox-height-field', tool).hidden = mode !== 'volume';
      if (a === null || b === null || (mode === 'volume' && c === null)) { result.textContent = `Enter ${mode === 'volume' ? 'length, width, and height' : 'length and width'} to calculate.`; return; }
      const unit = unitById('length', toolboxField(tool, 'dimensionUnit').value), toFeet = (unit?.[2] || 0.0254) / 0.3048, areaSqFt = a * b * toFeet * toFeet;
      if (mode === 'area') result.textContent = `${roundText(areaSqFt, 4)} sq ft · ${roundText(areaSqFt * 0.09290304, 4)} m²`;
      else { const cubicFt = a * b * c * toFeet * toFeet * toFeet; result.textContent = `${roundText(cubicFt, 4)} cu ft · ${roundText(cubicFt * 0.028316846592, 4)} m³`; }
      return;
    }
    if (tool.dataset.toolType === 'angle') {
      const mode = toolboxField(tool, 'mode').value;
      const showRise = mode === 'rise', showFirst = mode !== 'rise';
      $('.angle-rise-field', tool).hidden = !showRise; $('.angle-run-field', tool).hidden = !showRise;
      $('.angle-primary-field', tool).hidden = !showFirst; $('.angle-secondary-field', tool).hidden = mode !== 'triangle';
      let degrees = null, extra = '';
      if (mode === 'rise') { const rise = value('rise'), run = value('run'); if (rise === null || run === null || run === 0) { result.textContent = 'Enter rise and a non-zero run.'; return; } degrees = Math.atan(rise / run) * 180 / Math.PI; extra = ` · ${roundText(rise / run * 100, 3)}% slope`; }
      else { const angle = value('angle'); if (angle === null) { result.textContent = 'Enter an angle in degrees.'; return; } if (mode === 'complement') degrees = 90 - angle; else if (mode === 'supplement') degrees = 180 - angle; else { const angle2 = value('angle2'); if (angle2 === null) { result.textContent = 'Enter both known triangle angles.'; return; } degrees = 180 - angle - angle2; } }
      if (degrees < 0 || degrees > 180) { result.textContent = 'The entered angles do not produce a valid result.'; return; }
      const radians = degrees * Math.PI / 180; result.textContent = `${roundText(degrees, 4)}° · ${roundText(radians, 5)} rad${extra}`;
      return;
    }
    if (tool.dataset.toolType === 'weight') {
      const itemWeight = value('itemWeight'), quantityRaw = toolboxField(tool, 'quantity').value.trim(), quantity = quantityRaw && /^\d+$/.test(quantityRaw) ? Number(quantityRaw) : null, tare = value('tare') ?? 0, target = value('target'), unit = toolboxField(tool, 'unit').value;
      if (itemWeight === null || itemWeight <= 0) { result.textContent = 'Enter a positive item weight to calculate.'; return; }
      const factors = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 }, total = quantity === null ? null : itemWeight * quantity + tare;
      const pieces = [`Total: ${total === null ? 'enter a whole quantity' : `${roundText(total, 4)} ${unit}`}`];
      if (target !== null && target >= tare) pieces.push(`Quantity at target: ${Math.floor((target - tare) / itemWeight)} items`);
      else if (target !== null) pieces.push('Target must be at least the tare weight.');
      if (total !== null) pieces.push(`Total in kg: ${roundText(total * factors[unit] / 1000, 4)}`);
      result.textContent = pieces.join(' · ');
    }
  }
  function renderSettings() {
    const branding = normalizedBranding(state.settings.branding), accountStatus = cloudConflict ? 'Sync paused · choose a workshop copy' : authUser ? `Signed in as ${authUser.email || 'your account'}` : cloudAvailable ? 'Sign in to sync across devices' : 'Offline-only on this launch';
    return `${heading('YOUR WORKSPACE', 'Settings', 'Manage your shop, account, and app controls.')}<section class="settings-home-grid"><button class="settings-home-card" data-page="account"><span class="settings-home-icon">◉</span><span><strong>Shop & account</strong><small>${esc(branding.shopName || 'Personalize your workshop')} · ${esc(accountStatus)}</small></span><span class="settings-card-arrow">→</span></button><button class="settings-home-card" data-page="preferences"><span class="settings-home-icon">⚙</span><span><strong>App controls</strong><small>${state.settings.units === 'metric' ? 'Millimeters' : 'Inches'} · ${state.settings.units === 'metric' ? 'Decimal display' : state.settings.numberFormat === 'fraction' ? 'Fractions' : 'Decimal display'} · cut defaults</small></span><span class="settings-card-arrow">→</span></button></section><section class="settings-note"><strong>Your data stays yours</strong><p>Projects and workshop settings save on this device first. When signed in, changes sync to your private account when a connection is available.</p></section>`;
  }
  function renderPreferences() {
    const visibilityControls = FEATURE_OPTIONS.map(([key, label, description]) => `<label class="feature-setting-row"><span><strong>${esc(label)}</strong><small>${esc(description)}</small></span><input type="checkbox" data-feature-setting="${key}" ${featureEnabled(key) ? 'checked' : ''} aria-label="Show ${esc(label)}"></label>`).join('');
    return `<button class="text-link detail-back" data-page="settings">← Back to settings</button>${heading('APP CONTROLS', 'Measurements & defaults', 'Choose how BenchPilot handles dimensions and cut planning.')}<section class="settings-panel settings-stack"><div class="account-section-heading"><div><h2>Measurements</h2><p>Choose how dimensions and stock adjustments behave.</p></div></div><div class="setting-row"><div><strong>Measurement units</strong><p>Choose the units used to enter and display dimensions.</p></div><select class="filter-select" data-setting="units"><option value="inches" ${state.settings.units === 'inches' ? 'selected' : ''}>Inches</option><option value="metric" ${state.settings.units === 'metric' ? 'selected' : ''}>Metric (mm)</option></select></div><div class="setting-row"><div><strong>Measurement display</strong><p>${state.settings.units === 'metric' ? 'Metric dimensions display as decimals.' : 'Choose fractions or decimal inches.'}</p></div><select class="filter-select" data-setting="numberFormat" ${state.settings.units === 'metric' ? 'disabled' : ''}><option value="fraction" ${state.settings.numberFormat === 'fraction' ? 'selected' : ''}>Fractions</option><option value="decimal" ${state.settings.numberFormat === 'decimal' ? 'selected' : ''}>Decimals</option></select></div><div class="setting-row"><div><strong>Default saw kerf</strong><p>Used for new projects and as the starting value for cut planning.</p></div><label class="setting-input-with-unit"><input class="tolerance-input" type="text" inputmode="decimal" value="${esc(inputMeasure(state.settings.kerf))}" data-setting="kerf" aria-label="Default saw kerf"><span>${unitName()}</span></label></div><div class="setting-row"><div><strong>Material card size</strong><p>Set the starting size used in the Add Part material selector.</p></div><select class="filter-select" data-setting="materialCardSize"><option value="small" ${state.settings.materialCardSize === 'small' ? 'selected' : ''}>Small</option><option value="medium" ${state.settings.materialCardSize === 'medium' ? 'selected' : ''}>Medium</option><option value="large" ${state.settings.materialCardSize === 'large' ? 'selected' : ''}>Large</option></select></div></section><section class="settings-panel feature-settings"><div class="account-section-heading"><div><h2>Feature visibility</h2><p>These options change what appears in the interface. Your projects, builds, notes, and assignments remain saved.</p></div></div><div class="feature-settings-list">${visibilityControls}</div></section>`;
  }
  function renderCloudAccountPanel() {
    return `<section class="settings-panel cloud-panel"><div class="cloud-panel-heading"><div><strong>${authUser ? 'Account & cloud sync' : 'Login & cloud sync'}</strong><p>Each account has a private workshop copy. Changes save locally before they sync.</p></div><span class="offline-pill"><span class="status-dot"></span><span data-cloud-status>${esc(cloudStatus)}</span></span></div>${!cloudAvailable ? '<p class="panel-subtitle">This launch is offline-only. Open BenchPilot from its HTTPS Pages address to sign in and sync.</p>' : authUser ? `<div class="cloud-account-row"><div><strong>${esc(authUser.email || 'Signed-in account')}</strong><p>This device is connected to your private workshop.</p></div><div class="detail-actions"><button class="button button-secondary button-small" data-action="sync-now">Sync now</button><button class="button button-secondary button-small" data-action="cloud-sign-out">Sign out</button></div></div>` : `<form class="cloud-auth-form" data-cloud-auth><label>Email<input class="field-input" type="email" name="email" autocomplete="username" required></label><label>Password<input class="field-input" type="password" name="password" autocomplete="current-password" minlength="6" required></label><div class="detail-actions"><button class="button button-primary" type="submit" data-auth-mode="signin">Sign in</button><button class="button button-secondary" type="submit" data-auth-mode="signup">Create account</button></div></form>`}${cloudConflict ? `<div class="cloud-conflict" role="alert"><strong>Choose which workshop copy to keep</strong><p>Using the cloud copy replaces the workshop saved on this device. Download a manual backup first if you want to keep a separate copy.</p><div class="detail-actions"><button class="button button-secondary" data-action="use-cloud-copy">Use cloud copy</button><button class="button button-primary" data-action="keep-device-copy">Keep this device’s copy</button></div></div>` : ''}</section>`;
  }
  function renderAccount() {
    const branding = normalizedBranding(state.settings.branding), initials = branding.personalName || branding.shopName || 'Your shop';
    const logoPreview = branding.logoDataUrl ? `<img class="account-logo-preview" src="${branding.logoDataUrl}" alt="Current shop logo">` : `<span class="account-logo-placeholder">${esc(initials.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase())}</span>`;
    const colorFields = [['primaryColor', 'Primary color'], ['secondaryColor', 'Secondary color'], ['backgroundColor', 'Page background'], ['surfaceColor', 'Panel background'], ['textColor', 'Text color']].map(([key, label]) => `<label class="color-setting"><span>${label}</span><input type="color" value="${branding[key]}" data-brand-color="${key}" aria-label="${label}"></label>`).join('');
    const schemes = [['forest', 'Forest'], ['ocean', 'Ocean'], ['clay', 'Clay'], ['slate', 'Slate']].map(([key, label]) => `<button class="palette-option" type="button" data-action="apply-palette" data-id="${key}" aria-label="Apply ${label} color scheme"><span style="--palette-primary:${COLOR_SCHEMES[key].primaryColor};--palette-secondary:${COLOR_SCHEMES[key].secondaryColor}"></span>${label}</button>`).join('');
    return `<button class="text-link detail-back" data-page="settings">← Back to settings</button>${heading('YOUR WORKSPACE', 'Shop & account', 'Make BenchPilot feel like your own workshop.')}${renderCloudAccountPanel()}<section class="account-identity-card"><div class="account-logo-frame">${logoPreview}</div><div><p class="eyebrow">WORKSPACE PROFILE</p><h2>${esc(branding.shopName || 'Your shop name')}</h2><p>${esc(branding.personalName || 'Add your name')} · ${esc(authUser?.email || 'Local profile')}</p></div></section><section class="settings-panel account-panel"><div class="account-section-heading"><div><h2>Workshop identity</h2><p>These details personalize the app on your devices.</p></div></div><form id="workshop-profile-form"><div class="field-grid"><div class="field"><label class="field-label" for="shop-name">Shop name</label><input class="field-input" id="shop-name" name="shopName" maxlength="80" placeholder="Mane & Grain Workshop" value="${esc(branding.shopName)}"></div><div class="field"><label class="field-label" for="personal-name">Your name</label><input class="field-input" id="personal-name" name="personalName" maxlength="80" placeholder="Your name" value="${esc(branding.personalName)}"></div></div><div class="field logo-upload-field"><label class="field-label" for="shop-logo">Shop logo</label><div class="logo-upload-row"><input class="field-input" id="shop-logo" type="file" accept="image/png,image/jpeg,image/webp" data-logo-upload><small>PNG, JPEG, or WebP. The image is resized and synced as part of your workshop profile.</small>${branding.logoDataUrl ? '<button class="button button-quiet button-small" type="button" data-action="remove-shop-logo">Remove logo</button>' : ''}</div></div><div class="detail-actions"><button class="button button-primary" type="submit">Save profile</button></div></form></section><section class="settings-panel account-panel"><div class="account-section-heading"><div><h2>Color scheme</h2><p>Pick a starting palette, then adjust each color.</p></div></div><div class="palette-options">${schemes}</div><div class="color-settings-grid">${colorFields}</div><label class="setting-row dark-mode-setting"><span><strong>Dark mode</strong><small>Use a darker palette across pages, menus, and dialogs.</small></span><input type="checkbox" data-setting="darkMode" ${state.settings.darkMode ? 'checked' : ''} aria-label="Enable dark mode"></label></section><section class="settings-panel settings-stack"><div class="account-section-heading"><div><h2>Backups & device data</h2><p>Backups include projects, materials, builds, notes, and your workshop profile.</p></div></div><div class="setting-row"><div><strong>Download a backup</strong><p>Save a portable JSON copy of this device’s workshop.</p></div><button class="button button-secondary" data-action="export">Download backup</button></div><div class="setting-row"><div><strong>Restore a backup</strong><p>Load a BenchPilot or Jabo Workshop backup. The current data is backed up first.</p></div><button class="button button-secondary" data-action="import">Choose file</button></div><div class="setting-row"><div><strong>This device</strong><p>${state.projects.length} projects · ${state.materials.length} stock items · ${state.builds.length} builds</p></div><span class="offline-pill"><span class="status-dot"></span>Saved locally</span></div></section>`;
  }
  function applyColorScheme(id) {
    if (!Object.hasOwn(COLOR_SCHEMES, id)) return;
    const previous = structuredClone(normalizedBranding(state.settings.branding));
    state.settings.branding = { ...previous, ...COLOR_SCHEMES[id] };
    if (!save()) { state.settings.branding = previous; renderApp(); return; }
    renderApp(); toast('Color scheme saved.');
  }
  async function saveWorkshopLogo(file) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { toast('Choose a PNG, JPEG, or WebP image smaller than 5 MB.', true); renderApp(); return; }
    const previous = structuredClone(normalizedBranding(state.settings.branding));
    try {
      const bitmap = await createImageBitmap(file), scale = Math.min(1, 512 / bitmap.width, 240 / bitmap.height), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('Image processing is unavailable in this browser.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close?.();
      let dataUrl = canvas.toDataURL('image/webp', 0.86);
      if (!dataUrl.startsWith('data:image/webp;')) dataUrl = canvas.toDataURL('image/png');
      if (dataUrl.length > 650000) throw new Error('That logo is still too large after resizing. Choose a simpler or smaller image.');
      state.settings.branding = { ...previous, logoDataUrl: dataUrl };
      if (!save()) { state.settings.branding = previous; renderApp(); return; }
      renderApp(); toast('Shop logo saved to your workshop.');
    } catch (error) { state.settings.branding = previous; renderApp(); toast(error.message || 'Could not read that logo image.', true); }
  }
  function renderProjectDetail(p) {
    const parts = allProjectParts(p), tolerance = Number(p.cutTolerance) || 0, kerf = Number(p.cutKerf ?? state.settings.kerf) || 0;
    const partRows = parts.length ? `<div style="overflow-x:auto"><table class="part-table"><thead><tr><th>Part name</th><th>Qty</th><th>Length</th><th>Width</th><th>Stock material</th><th></th></tr></thead><tbody>${parts.map((part, i) => { const name = part.name?.trim() || `Part ${i + 1}`, mat = stockItem(part.materialId), source = part.buildRefId ? `<small class="part-note">${esc(part.sourceBuildName)} · v${part.sourceBuildVersion}</small>` : part.notes ? `<small class="part-note">${esc(part.notes)}</small>` : ''; return `<tr><td class="part-name">${esc(name)}${source}</td><td>${Number(part.quantity) || 1}</td><td class="dimension">${displayMeasure(part.length)}</td><td class="dimension">${displayMeasure(part.width || mat?.width)}</td><td>${esc(mat ? stockLabel(mat) : part.material || '—')}</td><td class="part-actions">${part.buildRefId ? '<span class="subtle">Build part</span>' : `<button class="button button-quiet button-small" data-action="edit-part" data-id="${esc(part.id)}">Edit</button><button class="button button-quiet button-small" data-action="delete-part" data-id="${esc(part.id)}" aria-label="Delete ${esc(name)}">×</button>`}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="coming-soon"><div><strong>No parts yet</strong>Add a part or a saved build to begin your cut list.</div></div>';
    const widthTolerance = Number(p.cutWidthTolerance) || 0;
    const ids = [...new Set(parts.map(part => part.materialId).filter(Boolean))], plans = ids.map(id => { const m = stockItem(id); return m ? { item: m, ...optimizeCuts(m, parts, tolerance, kerf, widthTolerance) } : null; }).filter(Boolean);
    const missing = parts.filter(p => !p.materialId || !stockItem(p.materialId)).length;
    const materialRows = plans.map(plan => { const planned = plan.boards.length, have = Number(plan.item.onHand) || 0, assigned = projectMaterialAllocation(p, plan.item.id), otherAssigned = Math.max(0, assignedMaterialCount(plan.item.id) - assigned), free = Math.max(0, have - otherAssigned - assigned), short = Math.max(0, planned - have), over = assigned + otherAssigned > have, red = short > 0 || plan.unfit.length > 0 || over, unit = materialKind(plan.item)==='plywood'?'sheets':'boards'; return `<tr class="${red ? 'material-short-row' : ''}"><td class="stock-wood"><span class="material-kind-badge">${materialKind(plan.item)}</span>${esc(stockLabel(plan.item))}</td><td>${have} ${unit}</td><td><input class="stock-count allocation-count" type="number" min="0" max="9999" value="${assigned}" aria-label="${esc(unit)} assigned to this project" data-project-allocation="${esc(plan.item.id)}"></td><td>${free} free</td><td>${planned} ${planned === 1 ? unit.replace(/s$/,'') : unit}${plan.unfit.length ? `<small class="material-warning">${plan.unfit.length} cut${plan.unfit.length === 1 ? '' : 's'} won’t fit</small>` : ''}</td><td>${over ? '<span class="shortage">Over-assigned</span>' : short ? `<span class="shortage">Buy ${short} more ${short === 1 ? unit.replace(/s$/,'') : unit}</span>` : plan.unfit.length ? '<span class="shortage">Check cut dimensions</span>' : '<span class="stock-ok">Covered</span>'}</td></tr>`; }).join('');
    const materialPanel = `<section class="detail-panel project-materials-panel"><div class="detail-panel-header"><div><h2 class="detail-panel-title">Project materials</h2><p class="panel-subtitle">Reserve the stock you want this project to use. Reservations do not change on-hand inventory.</p></div></div>${plans.length ? `<div class="project-material-table-wrap"><table class="project-material-table"><thead><tr><th>Stock material</th><th>Have</th><th>Assigned here</th><th>Free after assignment</th><th>Planned</th><th>Status</th></tr></thead><tbody>${materialRows}</tbody></table></div>` : '<div class="coming-soon"><div><strong>No stock assigned yet</strong>Select stock material on project parts to see what this project needs.</div></div>'}${missing ? `<p class="material-warning project-unassigned">${missing} part${missing === 1 ? ' needs' : 's need'} a stock material assignment before it can be planned.</p>` : ''}</section>`;
    const projectBuildRows = (p.builds || []).map(ref => { const savedBuild = build(ref.buildId), current = currentBuildVersion(savedBuild), canUpdate = current && current.id !== ref.versionId; return `<li class="project-build-row"><div><strong>${esc(ref.buildName || ref.snapshot?.name || 'Saved build')}</strong><span class="version-badge">Pinned · v${ref.versionNumber}</span><small>${ref.quantity} ${ref.quantity === 1 ? 'unit' : 'units'}${canUpdate ? ` · saved build is now v${current.number}` : ''}</small></div><div class="detail-actions"><button class="button button-secondary button-small" data-action="edit-project-build" data-id="${esc(ref.id)}">Quantity</button>${canUpdate ? `<button class="button button-secondary button-small" data-action="update-project-build" data-id="${esc(ref.id)}">Update to v${current.number}</button>` : ''}<button class="button button-quiet button-small" data-action="remove-project-build" data-id="${esc(ref.id)}">Remove</button></div></li>`; }).join('');
    const projectBuildPanel = `<section class="detail-panel project-builds-panel"><div class="detail-panel-header"><div><h2 class="detail-panel-title">Project builds</h2><p class="panel-subtitle">Each project keeps the selected build version until you update it here.</p></div><button class="button button-primary button-small" data-action="attach-build" data-id="${esc(p.id)}">＋ Add saved build</button></div>${projectBuildRows ? `<ul class="project-build-list">${projectBuildRows}</ul>` : '<p class="panel-subtitle">No saved builds in this project yet.</p>'}</section>`;
    let boardNo = 0;
    const boardCards = plans.map(plan => plan.boards.map(board => {
      boardNo++;
      const grouped = new Map(); for (const cut of board.pieces) { const key = `${cut.length}|${cut.width}|${cut.name}`; const old = grouped.get(key) || { ...cut, quantity: 0 }; old.quantity++; grouped.set(key, old); }
      const cuts = [...grouped.values()].map(cut => `<li><span>${cut.quantity} × ${displayMeasure(cut.length)} × ${displayMeasure(cut.width)}</span><small>${esc(cut.name || 'Unnamed part')}${cut.rotated ? ' · rotated' : ''}</small></li>`).join('');
      const reservedLength = Math.max(0, Number(plan.item.length) - plan.capacity);
      const reservedWidth = Math.max(0, plan.sheetWidth - plan.usableWidth);
      const svg = p.showCutVisualization ? `<svg class="cut-visual" viewBox="0 0 ${plan.item.length} ${plan.sheetWidth}" role="img" aria-label="Top view of board ${boardNo}, length shown horizontally"><rect class="cut-visual-stock" x="0" y="0" width="${plan.item.length}" height="${plan.sheetWidth}"/>${reservedLength?`<rect class="cut-visual-reserve" x="${plan.capacity}" y="0" width="${reservedLength}" height="${plan.sheetWidth}"/>`:''}${reservedWidth?`<rect class="cut-visual-reserve" x="0" y="${plan.usableWidth}" width="${plan.item.length}" height="${reservedWidth}"/>`:''}${board.pieces.map(cut=>`<rect class="cut-visual-piece" x="${cut.y}" y="${cut.x}" width="${cut.h}" height="${cut.w}"/><text x="${cut.y+cut.h/2}" y="${cut.x+cut.w/2}" text-anchor="middle" dominant-baseline="middle">${esc(cut.name || 'Cut')}</text>`).join('')}</svg>` : '';
      const reserved = Math.max(0, Number(plan.item.length) - plan.capacity), label = materialKind(plan.item)==='plywood'?'sheet':'board';
      return `<article class="board-plan"><header class="board-plan-header"><h3>${boardNo} — ${esc(plan.item.woodType)} ${displayMeasure(plan.item.length)} × ${displayMeasure(plan.item.width)} × ${displayMeasure(plan.item.thickness)}</h3><span>${displayMeasure(plan.capacity)} usable</span></header>${svg}<ul class="board-cuts">${cuts}</ul><footer>${board.pieces.length} cut${board.pieces.length===1?'':'s'} on this ${label}${reserved ? ` <span>·</span> leave ${displayMeasure(reserved)} uncut` : ''}</footer></article>`;
    }).join('')).join('');
    const unfit = plans.map(plan => { const grouped = new Map(); for (const cut of plan.unfit) { const key = `${cut.id}|${cut.length}|${cut.width}|${cut.name}`; const old = grouped.get(key) || { ...cut, quantity: 0 }; old.quantity++; grouped.set(key, old); } return [...grouped.values()].map(cut => `<div class="unfit-cut"><strong>${cut.quantity} × ${esc(cut.name || 'Unnamed part')}</strong> — ${displayMeasure(cut.length)} × ${displayMeasure(cut.width)} does not fit ${esc(stockLabel(plan.item))}.</div>`).join(''); }).join('');
    const boardPlan = `${boardCards || (!unfit ? '<div class="coming-soon"><div><strong>No board plan yet</strong>Add parts with stock materials to lay out their cuts.</div></div>' : '')}${unfit ? `<div class="unfit-list"><h3>Cuts that do not fit</h3>${unfit}</div>` : ''}${missing ? '<p class="stock-footnote">Assign stock to the remaining parts to include them in this cut plan.</p>' : ''}`;
    return `<button class="text-link detail-back" data-page="projects">← Back to projects</button><section class="detail-top"><div><p class="eyebrow">PROJECT DETAILS</p><h1 class="detail-title">${esc(p.name)}</h1><div style="margin-bottom:10px">${statusBadge(p.status)}${p.archived ? ' <span class="status-badge complete">Archived</span>' : ''}</div><p class="detail-copy">${esc(p.description || 'No description yet.')}</p></div><div class="detail-actions"><button class="button button-secondary button-small" data-action="edit-project" data-id="${esc(p.id)}">Edit project</button><button class="button button-secondary button-small" data-action="archive-project" data-id="${esc(p.id)}">${p.archived ? 'Restore project' : 'Archive project'}</button></div></section><div class="detail-panels">${materialPanel}${projectBuildPanel}<section class="detail-panel"><div class="detail-panel-header"><h2 class="detail-panel-title">Project parts</h2><button class="button button-primary button-small" data-action="new-part" data-id="${esc(p.id)}">＋ Add part</button></div>${partRows}</section><section class="detail-panel cut-plan-panel"><div class="detail-panel-header cut-plan-heading"><div><h2 class="detail-panel-title">Optimized cut list</h2><p class="panel-subtitle">Cuts are packed together across board length and width. Drawings run the stock length horizontally.</p></div><div class="cut-plan-controls"><label class="visualization-toggle"><input type="checkbox" data-cut-visualization ${p.showCutVisualization?'checked':''}><span>Show cut drawing</span></label><div class="tolerance-control"><label class="field-label" for="cut-tolerance">Length allowance (${unitName()})</label><input id="cut-tolerance" class="tolerance-input" type="text" inputmode="decimal" value="${esc(inputMeasure(tolerance))}" data-cut-tolerance><small>Reserved uncut at the end of each board or sheet.</small></div><div class="tolerance-control"><label class="field-label" for="cut-width-tolerance">Width allowance (${unitName()})</label><input id="cut-width-tolerance" class="tolerance-input" type="text" inputmode="decimal" value="${esc(inputMeasure(widthTolerance))}" data-cut-width-tolerance><small>Reserved uncut along one side of each board or sheet.</small></div><div class="kerf-control"><label class="field-label" for="cut-kerf">Saw kerf (${unitName()})</label><input id="cut-kerf" class="tolerance-input" type="text" inputmode="decimal" value="${esc(inputMeasure(kerf))}" data-cut-kerf><small>Adjust for the blade installed for this project.</small></div></div></div><div class="cut-plan-list">${boardPlan}</div><div class="cut-list-note">A ${displayMeasure(kerf)} kerf is allowed between neighboring cuts. Length and width allowances are excluded from usable stock. Grain direction, angled cuts, and saved offcuts are not tracked.</div><div class="print-project-action"><button class="button button-secondary button-small" data-action="print">Print project materials and cut plan</button></div></section><section class="detail-panel project-notes-panel"><div class="detail-panel-header"><h2 class="detail-panel-title">Project notes</h2><button class="button button-secondary button-small" data-action="edit-project" data-id="${esc(p.id)}">Edit notes</button></div><div class="notes-display">${esc(p.notes || 'No notes yet.')}</div></section></div>`;
  }
  function render() {
    renderApp();
  }

  function openModal(html, className = '') { $('#modal-root').innerHTML = `<div class="modal-backdrop"><section class="modal ${esc(className)}" role="dialog" aria-modal="true">${html}</section></div>`; $('input:not([type=hidden]),select,textarea', $('#modal-root'))?.focus(); }
  function openNestedModal(html, className = '') {
    const host = $('#modal-root .modal-backdrop:last-child');
    if (!host) { openModal(html, className); return; }
    host.insertAdjacentHTML('beforeend', `<div class="modal-backdrop nested-modal-backdrop"><section class="modal ${esc(className)}" role="dialog" aria-modal="true">${html}</section></div>`);
    const nested = $('#modal-root .nested-modal-backdrop:last-child');
    $('input:not([type=hidden]),select,textarea', nested)?.focus();
  }
  function closeModal() { const nested = $$('#modal-root .nested-modal-backdrop').pop(); if (nested) { nested.remove(); return; } pendingBuildExit = null; $('#modal-root').innerHTML = ''; }
  function buildModal(b = null) {
    const editing = !!b;
    openModal(`<h2>${editing ? 'Edit build details' : 'New saved build'}</h2><p class="modal-subtitle">${editing ? 'Design edits to parts create a new version. Projects keep their selected version.' : 'Start a reusable design. Add its parts after saving.'}</p><form id="build-form"><div class="field"><label class="field-label">Build name *</label><input class="field-input" name="name" maxlength="100" required value="${esc(b?.name || '')}" placeholder="Wall shelf"></div><div class="field"><label class="field-label">Description</label><textarea class="field-textarea" name="description" maxlength="1000">${esc(b?.description || '')}</textarea></div><p id="modal-error" class="modal-inline-error"></p><div class="modal-footer"><button type="button" class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary">${editing ? 'Save details' : 'Create build'}</button></div></form>`);
    $('#build-form').addEventListener('submit', e => { e.preventDefault(); const form = new FormData(e.currentTarget), name = String(form.get('name') || '').trim(); if (!name) { $('#modal-error').textContent = 'Give this build a name to continue.'; return; } if (editing) { b.name = name; b.description = String(form.get('description') || '').trim(); b.updatedAt = new Date().toISOString(); } else { b = { id: uid(), name, description: String(form.get('description') || '').trim(), archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), versions: [], draft: { versionNumber: 1, baseVersionId: null, parts: [], savedParts: [], dirty: false, updatedAt: new Date().toISOString() } }; state.builds.push(b); currentBuildId = b.id; currentPage = 'builds'; } const saved = save(); closeModal(); renderApp(); if (saved) toast(editing ? 'Build details saved.' : 'Build created as a version 1 draft.'); });
  }
  function projectBuildModal(p, ref = null) {
    const choices = state.builds.filter(b => !b.archived && currentBuildVersion(b));
    if (!ref && !choices.length) { toast('Create a saved build first.', true); currentPage = 'builds'; currentProjectId = null; renderApp(); return; }
    const selected = ref ? build(ref.buildId) : choices[0];
    const selector = ref ? `<p class="version-badge">${esc(ref.buildName || ref.snapshot?.name)} · pinned v${ref.versionNumber}</p>` : `<div class="field"><label class="field-label">Saved build *</label><select class="field-select" name="buildId">${choices.map(b => { const v = currentBuildVersion(b); return `<option value="${esc(b.id)}">${esc(b.name)} · current v${v.number}</option>`; }).join('')}</select></div>`;
    openModal(`<h2>${ref ? 'Project build quantity' : 'Add saved build to project'}</h2><p class="modal-subtitle">${ref ? 'The selected build version stays pinned.' : 'The project receives a snapshot of the current build version.'}</p><form id="project-build-form">${selector}<div class="field"><label class="field-label">Units required *</label><input class="field-input" name="quantity" type="number" min="1" max="9999" step="1" required value="${Number(ref?.quantity) || 1}"></div><p id="modal-error" class="modal-inline-error"></p><div class="modal-footer"><button type="button" class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary">${ref ? 'Save quantity' : 'Add to project'}</button></div></form>`);
    $('#project-build-form').addEventListener('submit', e => { e.preventDefault(); const form = new FormData(e.currentTarget), quantity = Number(form.get('quantity')), selectedBuild = ref ? selected : build(String(form.get('buildId') || '')), version = currentBuildVersion(selectedBuild); if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999 || !selectedBuild || !version) { $('#modal-error').textContent = 'Choose a saved build and a whole quantity from 1 to 9999.'; return; } const parts = version.parts || []; if (parts.some(part => (Number(part.quantity) || 1) * quantity > 9999)) { $('#modal-error').textContent = 'This quantity would exceed 9,999 of a part. Lower the build quantity or revise its bill of materials.'; return; } p.builds ||= []; if (ref) ref.quantity = quantity; else { const snapshot = snapshotBuild(selectedBuild, version); p.builds.push({ id: uid(), buildId: selectedBuild.id, versionId: version.id, versionNumber: version.number, buildName: selectedBuild.name, quantity, snapshot }); } touch(p); const saved = save(); closeModal(); renderApp(); if (saved) toast(ref ? 'Project build quantity updated.' : `Added ${selectedBuild.name} · v${version.number} to the project.`); });
  }
  function projectModal(p = null) {
    const edit = !!p; p ||= { name: '', description: '', status: 'planning', notes: '' };
    const statusField = featureEnabled('projectStatus') ? `<div class="field"><label class="field-label">Status</label><select class="field-select" name="status">${['planning', 'in-progress', 'paused', 'complete'].map(s => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${statusName(s)}</option>`).join('')}</select></div>` : '';
    const notesField = featureEnabled('projectNotes') ? `<div class="field"><label class="field-label">Project notes</label><textarea class="field-textarea" name="notes">${esc(p.notes || '')}</textarea></div>` : '';
    openModal(`<h2>${edit ? 'Edit project' : 'New project'}</h2><p class="modal-subtitle">${edit ? 'Update your project details and notes.' : 'Start with a name. Add parts whenever you’re ready.'}</p><form id="project-form"><div class="field"><label class="field-label" for="project-name">Project name *</label><input class="field-input" id="project-name" name="name" required maxlength="100" value="${esc(p.name)}"></div><div class="field"><label class="field-label">Description</label><textarea class="field-textarea" name="description">${esc(p.description || '')}</textarea></div>${statusField}${notesField}<p id="modal-error" class="modal-inline-error"></p><div class="modal-footer"><button type="button" class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary">${edit ? 'Save changes' : 'Create project'}</button></div></form>${edit ? `<button class="button button-quiet button-danger button-small" data-action="delete-project" data-id="${esc(p.id)}">Delete project…</button>` : ''}`);
    $('#project-form').addEventListener('submit', e => { e.preventDefault(); const d = new FormData(e.currentTarget), name = String(d.get('name') || '').trim(); if (!name) { $('#modal-error').textContent = 'Give your project a name to continue.'; return; } if (edit) { p.name = name; p.description = String(d.get('description') || '').trim(); if (featureEnabled('projectStatus')) p.status = d.get('status'); if (featureEnabled('projectNotes')) p.notes = String(d.get('notes') || '').trim(); touch(p); } else { p = { id: uid(), name, description: String(d.get('description') || '').trim(), status: featureEnabled('projectStatus') ? d.get('status') : 'planning', notes: featureEnabled('projectNotes') ? String(d.get('notes') || '').trim() : '', parts: [], builds: [], cutKerf: state.settings.kerf, archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; state.projects.push(p); currentPage = 'projects'; currentProjectId = p.id; } const saved = save(); closeModal(); render(); if (saved) toast(edit ? 'Project updated.' : 'Project created.'); });
  }
  function dashboardAddPartsModal() {
    const choices = state.projects.filter(item => !item.archived).sort((a, b) => a.name.localeCompare(b.name));
    if (!choices.length) { toast('Create a project before adding parts.', true); return; }
    openModal(`<h2>Add parts to a project</h2><p class="modal-subtitle">Choose a project and the part form will open without leaving your dashboard.</p><form id="dashboard-add-parts-form"><div class="field"><label class="field-label">Project *</label><select class="field-select" name="projectId" required>${choices.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></div><p id="modal-error" class="modal-inline-error"></p><div class="modal-footer"><button type="button" class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary">Continue to parts</button></div></form>`);
    $('#dashboard-add-parts-form').addEventListener('submit', e => { e.preventDefault(); const target = project(new FormData(e.currentTarget).get('projectId')); if (!target) { $('#modal-error').textContent = 'Choose a project to continue.'; return; } closeModal(); partModal(target); });
  }
  const woodTypes = ['Pine', 'Pressure treated pine', 'Poplar', 'Cedar', 'Douglas fir', 'Oak', 'Maple', 'Walnut', 'Birch', 'Cherry', 'Ash', 'Alder', 'Mahogany', 'Hickory', 'MDF', 'OSB', 'Plywood', 'Other'];
  function materialModal(m = null, onSaved = null, nested = false) {
    const edit = !!m, category = !edit || woodTypes.includes(m.woodType) ? (m?.woodType || 'Pine') : 'Other';
    const modalHtml = `<h2>${edit ? 'Edit material' : 'Add material'}</h2><p class="modal-subtitle">Give this stock a name you recognize, then enter length × width × thickness in ${unitName()}.</p><form id="material-form"><div class="field"><label class="field-label">Material name <span class="subtle">(optional)</span></label><input class="field-input" name="name" maxlength="80" placeholder="Shelf wood" value="${esc(m?.name || '')}"></div><div class="field-grid"><div class="field"><label class="field-label">Material type *</label><select class="field-select" name="materialType"><option value="lumber" ${(m ? materialKind(m) : 'lumber')==='lumber'?'selected':''}>Lumber</option><option value="plywood" ${(m ? materialKind(m) : '')==='plywood'?'selected':''}>Plywood</option><option value="other" ${(m ? materialKind(m) : '')==='other'?'selected':''}>Other wood</option></select></div><div class="field"><label class="field-label">Wood / sheet type *</label><select class="field-select" name="woodType" id="wood-type">${woodTypes.map(x => `<option ${(x === category || (m && x === m.woodType)) ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div><div class="field" id="wood-custom-wrap" ${category !== 'Other' ? 'hidden' : ''}><label class="field-label">Custom wood type *</label><input class="field-input" name="customWoodType" value="${esc(category === 'Other' ? m?.woodType || '' : '')}"></div><div class="field-grid"><div class="field"><label class="field-label">Stock length (${unitName()}) *</label><input class="field-input" name="length" required placeholder="96" value="${edit ? esc(inputMeasure(m.length)) : ''}"></div><div class="field"><label class="field-label">Stock width (${unitName()}) *</label><input class="field-input" name="width" required placeholder="11 1/4 or 48" value="${edit ? esc(inputMeasure(m.width)) : ''}"></div><div class="field"><label class="field-label">Thickness (${unitName()}) *</label><input class="field-input" name="thickness" required placeholder="3/4" value="${edit ? esc(inputMeasure(m.thickness)) : ''}"></div><div class="field"><label class="field-label">${m && materialKind(m)==='plywood' ? 'Sheets' : 'Boards'} you have *</label><input class="field-input" name="onHand" type="number" min="0" max="9999" step="1" required value="${Number(m?.onHand) || 0}"></div></div><p id="modal-error" class="modal-inline-error"></p><div class="modal-footer"><button type="button" class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary">${edit ? 'Save material' : 'Add material'}</button></div></form>`;
    if (nested) openNestedModal(modalHtml, 'material-create-modal'); else openModal(modalHtml);
    const modalScope = nested ? $('#modal-root .nested-modal-backdrop:last-child') : $('#modal-root');
    $('#material-form', modalScope).addEventListener('submit', e => { e.preventDefault(); const d = new FormData(e.currentTarget), type = d.get('woodType') === 'Other' ? String(d.get('customWoodType') || '').trim() : String(d.get('woodType') || '').trim(), name = String(d.get('name') || '').trim(), materialType = String(d.get('materialType') || 'lumber'), length = parseInput(d.get('length')), width = parseInput(d.get('width')), thickness = parseInput(d.get('thickness')), onHand = Number(d.get('onHand')); const error = $('#modal-error', modalScope); if (!type || [length, width, thickness].some(x => x === null || x <= 0) || !Number.isInteger(onHand) || onHand < 0) { error.textContent = 'Choose a stock type, positive dimensions, and a whole number of boards or sheets.'; return; } const linked = m ? [...state.projects.flatMap(allProjectParts).filter(p => p.materialId === m.id), ...state.builds.flatMap(b => [...(b.versions || []).flatMap(v => v.parts || []), ...buildParts(b)].filter(p => p.materialId === m.id))] : []; if (linked.some(p => { const pw=Number(p.width)||width; return !((p.length<=length+1e-8&&pw<=width+1e-8)||(pw<=length+1e-8&&p.length<=width+1e-8)); })) { error.textContent = 'The stock is too small for a part or saved build version already using it.'; return; } if (state.materials.some(x => x.id !== m?.id && materialKind(x) === materialType && x.woodType.toLowerCase() === type.toLowerCase() && x.length === length && x.width === width && x.thickness === thickness)) { error.textContent = 'That stock item already exists. Edit its on-hand count instead.'; return; } const next = { id: m?.id || uid(), name, materialType, woodType: type, length, width, thickness, onHand }; const old = m ? structuredClone(m) : null; if (m) Object.assign(m, next); else state.materials.push(next); const saved = save(); if (!saved) { if (m) Object.assign(m, old); else state.materials = state.materials.filter(x => x.id !== next.id); error.textContent = 'Could not save this material. Your changes are still here; please try again.'; return; } closeModal(); if (nested) { onSaved?.(next); toast('Material created and selected.'); } else { currentPage = 'materials'; currentProjectId = null; render(); toast('Material saved.'); } });
  }
  function partModal(p, part = null, buildTarget = null) {
    const edit = !!part, legacy = edit && !part.materialId ? part.material || '' : '';
    const thicknesses = [...new Set(state.materials.map(m=>Number(m.thickness)))].sort((a,b)=>a-b);
    const partsBeforeEdit = buildTarget ? buildParts(buildTarget) : p.parts;
    let selectedMaterialId = part?.materialId || '', filterKind = 'all', filterThickness = 'all';
    openModal(`<h2>${buildTarget ? (edit ? 'Edit build part' : 'Add a build part') : (edit ? 'Edit part' : 'Add a part')}</h2><p class="modal-subtitle">${buildTarget ? `This updates the v${buildTarget.draft?.versionNumber || (Number(currentBuildVersion(buildTarget)?.number || 0) + 1)} draft. Finalize it when the design is ready; projects keep using their pinned versions.` : `Enter the part dimensions in ${unitName()}. Leave width blank to use the material's full width.`}</p><form id="part-form"><input type="hidden" name="materialId" value="${esc(selectedMaterialId)}"><div class="part-form-layout"><section class="part-fields"><div class="field"><label class="field-label" for="part-name">Part name <span class="subtle">(optional)</span></label><input class="field-input" id="part-name" name="name" maxlength="80" placeholder="Shelf" value="${esc(part?.name || '')}"></div>${legacy ? `<small class="material-prompt">Previously entered as “${esc(legacy)}”. Choose stock to track this cut.</small>` : ''}<div class="field-grid"><div class="field"><label class="field-label">Quantity</label><input class="field-input" name="quantity" type="number" min="1" max="9999" value="${Number(part?.quantity) || 1}" required></div><div class="field"><label class="field-label">Length (${unitName()}) *</label><input class="field-input" name="length" required placeholder="${unitName() === 'mm' ? '2286' : '90'}" value="${part ? esc(inputMeasure(part.length)) : ''}"></div><div class="field"><label class="field-label">Width (${unitName()}, optional)</label><input class="field-input" name="width" placeholder="Uses stock width" value="${part?.width ? esc(inputMeasure(part.width)) : ''}"></div></div><div class="field"><label class="field-label">Part notes</label><textarea class="field-textarea" name="notes">${esc(part?.notes || '')}</textarea></div></section><section class="material-picker-section"><div class="material-picker-heading"><div><span class="picker-kicker">Choose stock</span><h3>Available materials</h3></div><button type="button" class="button button-secondary button-small" data-action="add-material-from-part">＋ Add new</button></div><div class="part-material-filters"><label>Type<select class="field-select" data-part-filter-type><option value="all">All types</option><option value="lumber">Lumber</option><option value="plywood">Plywood</option><option value="other">Other wood</option></select></label><label>Thickness<select class="field-select" data-part-filter-thickness><option value="all">All</option>${thicknesses.map(t=>`<option value="${t}">${displayMeasure(t)}</option>`).join('')}</select></label></div><div class="material-picker-size"><label>Card size<select class="field-select" data-picker-size><option value="small" ${state.settings.materialCardSize === 'small' ? 'selected' : ''}>Small</option><option value="medium" ${state.settings.materialCardSize === 'medium' ? 'selected' : ''}>Medium</option><option value="large" ${state.settings.materialCardSize === 'large' ? 'selected' : ''}>Large</option></select></label></div><div class="material-picker-scroll" tabindex="0" aria-label="Available stock materials"><div class="material-card-grid" id="material-card-grid"></div></div><div class="material-selection-summary" id="material-selection-summary"></div></section></div><p id="modal-error" class="modal-inline-error"></p><div class="modal-footer"><button type="button" class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary">${edit ? 'Save part' : (buildTarget ? 'Save to draft' : 'Add to project')}</button></div></form>`, 'part-modal');
    const cardMarkup = m => {
      const chosen = m.id === selectedMaterialId, plywood = materialKind(m) === 'plywood', width = Math.max(0.1, Number(m.width) || 1), length = Math.max(0.1, Number(m.length) || 1), thick = Math.max(0.1, Number(m.thickness) || 1);
      const scale = plywood ? Math.min(112 / length, 42 / width) : Math.min(112 / width, 42 / thick), faceWidth = Math.min(116, Math.max(plywood ? 34 : 25, (plywood ? length : width) * scale)), faceHeight = Math.min(46, Math.max(plywood ? 24 : 16, (plywood ? width : thick) * scale));
      const dimensionRow = (label, value) => `<span class="material-dimension-row"><small>${label}</small><strong>${esc(displayMeasure(value))} ${esc(unitName())}</strong></span>`;
      const dimensions = plywood ? `${dimensionRow('Length', m.length)}${dimensionRow('Width', m.width)}` : `${dimensionRow('Face', m.width)}${dimensionRow('Thickness', m.thickness)}`;
      return `<button type="button" role="option" aria-selected="${chosen}" class="material-choice-card ${chosen ? 'selected' : ''}" data-select-material="${esc(m.id)}"><span class="material-measurement-header">${dimensions}</span><span class="material-face-stage"><span class="material-face ${plywood ? 'plywood-texture' : 'lumber-texture'}" style="width:${faceWidth.toFixed(1)}px;height:${faceHeight.toFixed(1)}px"></span></span>${plywood ? dimensionRow('Thickness', m.thickness).replace('material-dimension-row', 'material-dimension-row material-choice-depth') : ''}<span class="material-choice-name">${esc(m.name || m.woodType)}</span><span class="material-choice-meta">${plywood ? `${esc(m.woodType)} · Sheet stock` : `${esc(m.woodType)} · ${esc(displayMeasure(m.length))} ${esc(unitName())} stock`}</span><span class="material-choice-footer"><span>${materialKind(m)==='other'?'Other stock':plywood?'Sheet stock':'Lumber'}</span><span>${Number(m.onHand)||0} on hand</span></span></button>`;
    };
    const renderMaterialCards = () => { const grid = $('#material-card-grid'); if (!grid) return; const currentMaterials = state.materials.slice().sort((a, b) => materialKind(a).localeCompare(materialKind(b)) || a.thickness-b.thickness || a.woodType.localeCompare(b.woodType) || a.length-b.length); const visible = currentMaterials.filter(m => (filterKind === 'all' || materialKind(m) === filterKind) && (filterThickness === 'all' || Number(m.thickness) === Number(filterThickness))); grid.dataset.size = state.settings.materialCardSize; grid.innerHTML = `${visible.map(cardMarkup).join('')}${!state.materials.length ? `<div class="material-picker-empty"><strong>No stock materials yet</strong><span>Add stock here to continue.</span></div>` : visible.length ? '' : `<div class="material-picker-empty"><strong>No matching stock</strong><span>Try another type or thickness filter.</span></div>`}<button type="button" class="material-add-card" data-action="add-material-from-part"><span>＋</span><strong>Add new material</strong><small>Create stock without leaving this part.</small></button>`; const hidden = $('#part-form [name="materialId"]'); if (hidden) hidden.value = selectedMaterialId; const selected = stockItem(selectedMaterialId), summary = $('#material-selection-summary'); if (summary) summary.innerHTML = selected ? `<span class="selection-check">✓</span><span><small>Selected stock</small><strong>${esc(selected.name || selected.woodType)} · ${esc(displayMeasure(selected.length))} × ${esc(displayMeasure(selected.width))} × ${esc(displayMeasure(selected.thickness))} ${esc(unitName())}</strong></span>` : '<span class="selection-empty">Select a material card to continue.</span>'; };
    $('#part-form').selectMaterial = id => { const selected = stockItem(id); if (!selected) return; selectedMaterialId = id; if ((filterKind !== 'all' && materialKind(selected) !== filterKind) || (filterThickness !== 'all' && Number(selected.thickness) !== Number(filterThickness))) { filterKind = 'all'; filterThickness = 'all'; $('[data-part-filter-type]', $('#part-form')).value = 'all'; $('[data-part-filter-thickness]', $('#part-form')).value = 'all'; } renderMaterialCards(); };
    renderMaterialCards();
    $('[data-part-filter-type]', $('#part-form')).addEventListener('change', e => { filterKind = e.currentTarget.value; renderMaterialCards(); });
    $('[data-part-filter-thickness]', $('#part-form')).addEventListener('change', e => { filterThickness = e.currentTarget.value; renderMaterialCards(); });
    $('[data-picker-size]', $('#part-form')).addEventListener('change', e => { const previous = state.settings.materialCardSize; state.settings.materialCardSize = e.currentTarget.value; if (!save()) { state.settings.materialCardSize = previous; e.currentTarget.value = previous; } renderMaterialCards(); });
    $('#part-form').addEventListener('submit', e => { e.preventDefault(); const d = new FormData(e.currentTarget), material = stockItem(String(d.get('materialId') || '')), length = parseInput(d.get('length')), rawWidth = String(d.get('width') || '').trim(), width = rawWidth ? parseInput(rawWidth) : null, quantity = Number(d.get('quantity')); if (!material || length === null || length <= 0 || (rawWidth && (width === null || width <= 0)) || !Number.isInteger(quantity) || quantity < 1 || quantity > 9999) { $('#modal-error').textContent = 'Choose stock, a whole quantity from 1 to 9,999, and positive part dimensions.'; return; } const partWidth = width || Number(material.width); if (!((length <= material.length+1e-8 && partWidth <= material.width+1e-8) || (partWidth <= material.length+1e-8 && length <= material.width+1e-8))) { $('#modal-error').textContent = 'This part does not fit within the selected stock dimensions.'; return; } const value = { id: part?.id || uid(), name: String(d.get('name') || '').trim(), quantity, length, materialId: material.id, material: stockLabel(material), notes: String(d.get('notes') || '').trim() }; if (width || buildTarget) value.width = width || partWidth; if (buildTarget) { const nextParts = structuredClone(partsBeforeEdit); if (part) { const index = nextParts.findIndex(item => item.id === part.id); if (index >= 0) nextParts[index] = value; } else nextParts.push(value); updateBuildDraft(buildTarget, nextParts); } else { if (part) { Object.assign(part, value); if (!width) delete part.width; delete part.thickness; delete part.legacyDimensions; } else p.parts.push(value); touch(p); } const saved = save(); closeModal(); renderApp(); if (saved) toast(buildTarget ? `Added to version ${buildTarget.draft.versionNumber} draft. Finalize when ready.` : 'Part saved. Cut layouts updated.'); });
  }
  function downloadText(contents, filename, type = 'application/json') { const url = URL.createObjectURL(new Blob([contents], { type })), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function exportData() { downloadText(JSON.stringify({ ...state, app: BRAND.name, exportedAt: new Date().toISOString() }, null, 2), `benchpilot-backup-${new Date().toISOString().slice(0, 10)}.json`); toast('Backup downloaded.'); }
  function exportRecoveryData() { try { const raw = localStorage.getItem(activeStoreKey()); if (raw === null) throw new Error('No saved copy was found in this browser profile.'); downloadText(raw, `benchpilot-recovery-${new Date().toISOString().slice(0, 10)}.json`); toast('Recovery copy downloaded. Keep it before restoring a backup.'); } catch (error) { toast(error.message || 'Could not read a recovery copy.', true); } }
  function renderApp() {
    document.title = BRAND.name;
    const brand = $('.brand');
    if (brand) { brand.setAttribute('aria-label', `${BRAND.name} dashboard`); $('strong', brand).textContent = BRAND.shortName; }
    applyWorkspaceAppearance();
    if (currentPage === 'builds' && !featureEnabled('buildsMenu')) { currentBuildId = null; currentPage = 'dashboard'; }
    if (currentPage === 'calculator' && !featureEnabled('cutCalculator')) currentPage = 'dashboard';
    const buildsNav = $('.nav-item[data-page="builds"]');
    if (buildsNav) buildsNav.hidden = !featureEnabled('buildsMenu');
    if (currentToolId && currentToolId === 'cutCalculator' && !featureEnabled('cutCalculator')) currentToolId = null;
    const status = $('#data-save-status');
    if (status) status.textContent = storageBlocked ? 'Saved copy needs recovery' : storageDirty ? 'Changes not confirmed saved' : 'Saved on this device';
    const p = currentProjectId ? project(currentProjectId) : null; if (currentProjectId && !p) currentProjectId = null;
    const b = currentBuildId ? build(currentBuildId) : null; if (currentBuildId && !b) currentBuildId = null;
    const breadcrumb = { dashboard: 'Dashboard', projects: 'Projects', builds: 'Builds', materials: 'Materials', toolbox: currentToolId ? `Toolbox / ${TOOLBOX_TOOLS.find(tool => tool[0] === currentToolId)?.[1] || 'Tool'}` : 'Toolbox', calculator: 'Toolbox / Cut calculator', settings: 'Settings', account: 'Settings / Shop & account', preferences: 'Settings / App controls' };
    $('#breadcrumb-current').textContent = p ? 'Projects / Project details' : b ? 'Builds / Build details' : breadcrumb[currentPage] || 'Settings';
    $('#project-count').textContent = state.projects.filter(x => !x.archived && x.status !== 'complete').length;
    const navPage = ['settings', 'account', 'preferences'].includes(currentPage) ? 'settings' : currentPage === 'calculator' || currentPage === 'toolbox' ? 'toolbox' : currentPage;
    $$('.nav-item[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === navPage));
    const pageRenderers = { dashboard: renderDashboard, projects: renderProjects, builds: renderBuilds, materials: renderMaterials, calculator: renderCalculator, toolbox: renderToolbox, settings: renderSettings, account: renderAccount, preferences: renderPreferences };
    const content = p ? renderProjectDetail(p) : b ? renderBuilds() : (pageRenderers[currentPage] || renderSettings)();
    const saveWarning = storageBlocked
      ? storageBlockedReason === 'migration'
        ? `<div class="storage-warning" role="alert"><strong>Saved data could not be upgraded yet.</strong><p>The original browser copy is preserved and writing is paused. Download a recovery copy, resolve the browser storage issue, then reopen the app; you can also restore a backup.</p><button class="button button-secondary button-small" data-action="export-recovery">Download recovery copy</button><button class="button button-secondary button-small" data-action="import">Restore from backup</button></div>`
        : `<div class="storage-warning" role="alert"><strong>Saved data could not be read.</strong><p>The original browser copy is preserved. Download a recovery copy before restoring a backup.</p><button class="button button-secondary button-small" data-action="export-recovery">Download recovery copy</button><button class="button button-secondary button-small" data-action="import">Restore from backup</button></div>`
      : storageDirty ? `<div class="storage-warning" role="alert"><strong>Some changes may not be saved.</strong><p>Download a backup before closing this window, then check available browser storage.</p><button class="button button-secondary button-small" data-action="export">Download backup</button></div>` : '';
    $('#page-content').innerHTML = `${saveWarning}${content}`;
    updateToolboxResult($('#page-content'));
    updateTopbarSyncButton();
  }
  const root = $('#page-content');
  $('[data-action="topbar-sync"]').addEventListener('click', handleTopbarSync);
  function refreshToolboxTimerDisplays() {
    const clock = state.settings.toolboxTimers, watch = $('.stopwatch-display', root);
    if (watch) watch.textContent = formatDuration(clock.stopwatch.elapsedMs + (clock.stopwatch.startedAt ? Math.max(0, Date.now() - clock.stopwatch.startedAt) : 0));
    for (const timer of clock.timers) {
      const row = $$('[data-timer-row]', root).find(item => item.dataset.timerRow === timer.id); if (!row) continue;
      const remaining = timerRemaining(timer), running = !!timer.endsAt && remaining > 0, display = $('[data-timer-display]', row), status = $('[data-timer-status]', row), toggle = $('[data-action="toggle-shop-timer"]', row);
      if (display) display.textContent = formatDuration(remaining);
      if (status) status.textContent = remaining === 0 ? 'Finished' : running ? 'Running' : 'Paused';
      if (toggle) toggle.textContent = running ? 'Pause' : remaining === 0 ? 'Restart' : 'Start';
      row.classList.toggle('is-finished', remaining === 0);
      if (remaining === 0 && !completedTimerNotices.has(timer.id)) { completedTimerNotices.add(timer.id); if (document.visibilityState === 'visible') toast(`${timer.name} finished.`); }
    }
  }
  setInterval(refreshToolboxTimerDisplays, 1000);
  root.addEventListener('input', e => { if (e.target.closest('.toolbox-tool')) updateToolboxResult(root); });
  root.addEventListener('change', e => {
    const tool = e.target.closest('.toolbox-tool'); if (!tool) return;
    if (tool.dataset.toolType === 'converter' && e.target.matches('[data-tool-field="category"]')) {
      const category = e.target.value, units = CONVERSION_UNITS[category] || [], first = units[0]?.[0] || 'C', second = units.at(-1)?.[0] || 'F';
      toolboxField(tool, 'from').innerHTML = toolboxUnitOptions(category, first);
      toolboxField(tool, 'to').innerHTML = toolboxUnitOptions(category, second);
    }
    if (tool.dataset.toolType === 'areaVolume' && e.target.matches('[data-tool-field="preset"]')) toolboxField(tool, 'mode').value = e.target.value === 'box' ? 'volume' : 'area';
    updateToolboxResult(root);
  });
  root.addEventListener('submit', e => {
    if (e.target.matches('[data-cloud-auth]')) { submitCloudAuth(e); return; }
    if (e.target.matches('[data-create-timer]')) { e.preventDefault(); const data = new FormData(e.target), hours = Number(data.get('hours')), minutes = Number(data.get('minutes')), seconds = Number(data.get('seconds')), durationMs = ((hours * 3600) + (minutes * 60) + seconds) * 1000; if (![hours, minutes, seconds].every(Number.isInteger) || hours < 0 || hours > 168 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59 || durationMs <= 0 || durationMs > 604800000) { toast('Choose a timer duration greater than zero and no longer than one week.', true); return; } if (state.settings.toolboxTimers.timers.length >= 20) { toast('BenchPilot can store up to 20 timers.', true); return; } const previous = structuredClone(state.settings.toolboxTimers); state.settings.toolboxTimers.timers.push({ id: uid(), name: String(data.get('name') || '').trim().slice(0, 60) || 'Shop timer', durationMs, remainingMs: durationMs, endsAt: null }); if (!save()) state.settings.toolboxTimers = previous; else toast('Timer added.'); renderApp(); return; }
    if (e.target.id !== 'workshop-profile-form') return;
    e.preventDefault();
    const form = new FormData(e.target), previous = structuredClone(normalizedBranding(state.settings.branding));
    state.settings.branding = { ...previous, shopName: String(form.get('shopName') || '').trim().slice(0, 80), personalName: String(form.get('personalName') || '').trim().slice(0, 80) };
    if (!save()) { state.settings.branding = previous; renderApp(); return; }
    renderApp(); toast('Workshop profile saved.');
  });
  root.addEventListener('click', e => {
    const pageBtn = e.target.closest('[data-page]'); if (pageBtn) { const page = pageBtn.dataset.page; requestBuildExit(() => { currentProjectId = null; currentBuildId = null; currentToolId = null; currentPage = page; renderApp(); }); return; }
    const openTool = e.target.closest('[data-open-tool]'); if (openTool) { const id = openTool.dataset.openTool; if (!TOOLBOX_TOOLS.some(tool => tool[0] === id) || (id === 'cutCalculator' && !featureEnabled('cutCalculator'))) return; currentToolId = id; currentPage = 'toolbox'; currentProjectId = null; currentBuildId = null; renderApp(); return; }
    const openBuild = e.target.closest('[data-open-build]'); if (openBuild) { const id = openBuild.dataset.openBuild; requestBuildExit(() => { currentBuildId = id; currentProjectId = null; currentPage = 'builds'; renderApp(); }); return; }
    const open = e.target.closest('[data-open-project]'); if (open) { const id = open.dataset.openProject; requestBuildExit(() => { currentProjectId = id; currentBuildId = null; currentPage = 'projects'; renderApp(); }); return; }
    const b = e.target.closest('[data-action]'); if (!b) return;
    const action = b.dataset.action, id = b.dataset.id, p = ['new-part', 'edit-part', 'delete-part'].includes(action) ? project(currentProjectId) : project(id || currentProjectId);
    if (action === 'toggle-toolbox-edit') { toolboxEditMode = !toolboxEditMode; renderApp(); }
    else if (action === 'toolbox-home') { currentToolId = null; renderApp(); }
    else if (action === 'toggle-stopwatch') { const timers = state.settings.toolboxTimers, previous = structuredClone(timers), watch = timers.stopwatch; if (watch.startedAt) { watch.elapsedMs += Math.max(0, Date.now() - watch.startedAt); watch.startedAt = null; } else watch.startedAt = Date.now(); if (!save()) state.settings.toolboxTimers = previous; renderApp(); }
    else if (action === 'reset-stopwatch') { const previous = structuredClone(state.settings.toolboxTimers); state.settings.toolboxTimers.stopwatch = { elapsedMs: 0, startedAt: null }; if (!save()) state.settings.toolboxTimers = previous; renderApp(); }
    else if (action === 'toggle-shop-timer') { const previous = structuredClone(state.settings.toolboxTimers), timer = state.settings.toolboxTimers.timers.find(item => item.id === id); if (!timer) return; const now = Date.now(); if (timer.endsAt && timer.endsAt > now) { timer.remainingMs = timer.endsAt - now; timer.endsAt = null; } else { if (timerRemaining(timer, now) <= 0) timer.remainingMs = timer.durationMs; timer.endsAt = now + timer.remainingMs; completedTimerNotices.delete(id); } if (!save()) state.settings.toolboxTimers = previous; renderApp(); }
    else if (action === 'reset-shop-timer') { const previous = structuredClone(state.settings.toolboxTimers), timer = state.settings.toolboxTimers.timers.find(item => item.id === id); if (!timer) return; timer.endsAt = null; timer.remainingMs = timer.durationMs; completedTimerNotices.delete(id); if (!save()) state.settings.toolboxTimers = previous; renderApp(); }
    else if (action === 'delete-shop-timer') { const previous = structuredClone(state.settings.toolboxTimers); state.settings.toolboxTimers.timers = state.settings.toolboxTimers.timers.filter(item => item.id !== id); completedTimerNotices.delete(id); if (!save()) state.settings.toolboxTimers = previous; renderApp(); }
    else if (action === 'copy-tool-result') { const output = b.closest('.toolbox-tool')?.querySelector('[data-tool-result]')?.textContent?.trim(); if (!output || /enter .*calculate|enter a valid|choose units/i.test(output)) toast('Calculate a result before copying it.', true); else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(output).then(() => toast('Result copied.')).catch(() => toast('Clipboard access was unavailable in this browser.', true)); else toast('Clipboard access was unavailable in this browser.', true); }
    else if (action === 'reset-toolbox') { const previous = state.settings.toolboxTools.slice(); state.settings.toolboxTools = DEFAULT_TOOLBOX_TOOLS.slice(); if (!save()) state.settings.toolboxTools = previous; renderApp(); }
    else if (action === 'hide-tool') { const previous = state.settings.toolboxTools.slice(); state.settings.toolboxTools = previous.filter(toolId => toolId !== b.dataset.toolId); if (!save()) state.settings.toolboxTools = previous; renderApp(); }
    else if (action === 'restore-tool') { const toolId = b.dataset.toolId; if (!TOOLBOX_TOOLS.some(tool => tool[0] === toolId) || state.settings.toolboxTools.includes(toolId)) return; const previous = state.settings.toolboxTools.slice(); state.settings.toolboxTools.push(toolId); if (!save()) state.settings.toolboxTools = previous; renderApp(); }
    else if (action === 'move-tool-up' || action === 'move-tool-down') { const previous = state.settings.toolboxTools.slice(), next = previous.slice(), from = next.indexOf(b.dataset.toolId), to = from + (action.endsWith('up') ? -1 : 1); if (from < 0 || to < 0 || to >= next.length) return; [next[from], next[to]] = [next[to], next[from]]; state.settings.toolboxTools = next; if (!save()) state.settings.toolboxTools = previous; renderApp(); }
    else if (action === 'toggle-dashboard-edit') { dashboardEditMode = !dashboardEditMode; renderApp(); }
    else if (action === 'add-dashboard-widget') { const widgetId = b.dataset.widgetId; if (!DASHBOARD_WIDGETS.some(row => row[0] === widgetId) || state.settings.dashboardWidgets.includes(widgetId) || !availableDashboardWidgets().some(row => row[0] === widgetId)) return; const previous = state.settings.dashboardWidgets.slice(); state.settings.dashboardWidgets.push(widgetId); if (!save()) state.settings.dashboardWidgets = previous; renderApp(); }
    else if (action === 'remove-dashboard-widget') { const previous = state.settings.dashboardWidgets.slice(); state.settings.dashboardWidgets = previous.filter(widgetId => widgetId !== b.dataset.widgetId); if (!save()) state.settings.dashboardWidgets = previous; renderApp(); }
    else if (action === 'move-dashboard-widget-up' || action === 'move-dashboard-widget-down') { const previous = state.settings.dashboardWidgets.slice(), from = previous.indexOf(b.dataset.widgetId), to = from + (action.endsWith('up') ? -1 : 1); if (from < 0 || to < 0 || to >= previous.length) return; state.settings.dashboardWidgets.splice(from, 1); state.settings.dashboardWidgets.splice(to, 0, previous[from]); if (!save()) state.settings.dashboardWidgets = previous; renderApp(); }
    else if (action === 'dashboard-add-parts') dashboardAddPartsModal();
    else if (action === 'dashboard-calculate') { const widget = b.closest('.dashboard-widget'), first = parseInput($('[data-dashboard-calc="first"]', widget)?.value), second = parseInput($('[data-dashboard-calc="second"]', widget)?.value), operation = $('[data-dashboard-calc="operation"]', widget)?.value; if (first === null || second === null) { toast(`Enter two valid measurements in ${unitName()}.`, true); return; } const result = Math.round((first + (operation === 'subtract' ? -second : second)) * 10000) / 10000; $('[data-dashboard-calc-result]', widget).textContent = displayMeasure(result); }
    else if (action === 'cloud-sign-out') { (async () => { await syncCloudNow(); const { error } = await supabaseClient.auth.signOut(); if (error) toast(error.message, true); })(); }
    else if (action === 'sync-now') syncCloudNow();
    else if (action === 'use-cloud-copy') chooseCloudCopy();
    else if (action === 'keep-device-copy') chooseDeviceCopy();
    else if (action === 'apply-palette') applyColorScheme(id);
    else if (action === 'remove-shop-logo') { const previous = structuredClone(normalizedBranding(state.settings.branding)); state.settings.branding = { ...previous, logoDataUrl: '' }; if (!save()) state.settings.branding = previous; renderApp(); }
    else if (action === 'new-project') projectModal();
    else if (action === 'new-build') buildModal();
    else if (action === 'edit-build' && build(id)) buildModal(build(id));
    else if (action === 'duplicate-build' && build(id)) requestBuildExit(() => {
      const source = build(id), parts = buildParts(source), copy = { id: uid(), name: `${source.name} copy`, description: source.description || '', archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), versions: [] };
      const copiedParts = parts.map(part => ({ ...structuredClone(part), id: uid() }));
      commitBuildVersion(copy, copiedParts); state.builds.push(copy); currentBuildId = copy.id; currentProjectId = null; currentPage = 'builds'; if (save()) toast(`Duplicated as ${copy.name} · version 1.`); renderApp();
    });
    else if (action === 'archive-build' && build(id)) { const target = build(id); target.archived = !target.archived; target.updatedAt = new Date().toISOString(); if (save()) toast(target.archived ? 'Build archived. Projects keep their pinned versions.' : 'Build restored.'); renderApp(); }
    else if (action === 'new-build-part' && build(id)) partModal(null, null, build(id));
    else if (action === 'start-build-edit' && build(currentBuildId)) { const target = build(currentBuildId); startBuildDraft(target); if (save()) toast(`Editing version ${target.draft.versionNumber} draft.`); renderApp(); }
    else if (action === 'save-build-draft' && build(currentBuildId)) { const target = build(currentBuildId); if (saveBuildDraft(target)) toast(`Version ${target.draft.versionNumber} draft saved.`); renderApp(); }
    else if (action === 'finalize-build-version' && build(currentBuildId)) { const target = build(currentBuildId), draft = target.draft; if (!draft?.parts.length) toast('Add at least one part before finalizing this version.', true); else if (confirm(`Finalize version ${draft.versionNumber} of “${target.name}”? Projects using an earlier version will remain pinned to it.`)) { if (finalizeBuildDraft(target)) toast(`Finalized ${target.name} · v${currentBuildVersion(target).number}.`); renderApp(); } }
    else if (action === 'edit-build-part' && build(currentBuildId)) { const target = build(currentBuildId), part = buildParts(target).find(item => item.id === id); if (part) partModal(null, part, target); }
    else if (action === 'delete-build-part' && build(currentBuildId)) { const target = build(currentBuildId), parts = buildParts(target).filter(item => item.id !== id); updateBuildDraft(target, parts); if (save()) toast(`Part removed from version ${target.draft.versionNumber} draft.`); renderApp(); }
    else if (action === 'attach-build' && p) projectBuildModal(p);
    else if (action === 'edit-project-build') { const targetProject = project(currentProjectId), ref = targetProject?.builds?.find(item => item.id === id); if (targetProject && ref) projectBuildModal(targetProject, ref); }
    else if (action === 'update-project-build') { const targetProject = project(currentProjectId), ref = targetProject?.builds?.find(item => item.id === id), targetBuild = build(ref?.buildId), version = currentBuildVersion(targetBuild); if (targetProject && ref && version && confirm(`Update “${ref.buildName}” in this project from v${ref.versionNumber} to v${version.number}? This changes this project's parts and cut list.`)) { const snapshot = snapshotBuild(targetBuild, version); if (snapshot && snapshot.parts.every(part => (Number(part.quantity) || 1) * Number(ref.quantity) <= 9999)) { ref.versionId = snapshot.versionId; ref.versionNumber = snapshot.versionNumber; ref.buildName = snapshot.name; ref.snapshot = snapshot; touch(targetProject); if (save()) toast(`Project now uses ${snapshot.name} · v${snapshot.versionNumber}.`); renderApp(); } else toast('This build quantity exceeds the supported part count.', true); } }
    else if (action === 'remove-project-build') { const targetProject = project(currentProjectId), ref = targetProject?.builds?.find(item => item.id === id); if (targetProject && ref && confirm(`Remove ${ref.buildName} · v${ref.versionNumber} from this project? Its parts will leave the cut list.`)) { targetProject.builds = targetProject.builds.filter(item => item.id !== id); touch(targetProject); if (save()) toast('Saved build removed from this project.'); renderApp(); } }
    else if (action === 'new-part' && p) partModal(p);
    else if (action === 'edit-part' && p) { const part = p.parts.find(x => x.id === id); if (part) partModal(p, part); }
    else if (action === 'delete-part' && p) { p.parts = p.parts.filter(x => x.id !== id); touch(p); const saved = save(); renderApp(); if (saved) toast('Part removed.'); }
    else if (action === 'edit-project' && p) projectModal(p);
    else if (action === 'archive-project' && p) { p.archived = !p.archived; touch(p); const saved = save(); renderApp(); if (saved) toast(p.archived ? 'Project archived.' : 'Project restored.'); }
    else if (action === 'delete-project' && p) { if (confirm(`Delete “${p.name}” and its parts? This cannot be undone.`)) { state.projects = state.projects.filter(x => x.id !== p.id); currentProjectId = null; currentPage = 'projects'; closeModal(); save(); renderApp(); } }
    else if (action === 'new-material') materialModal();
    else if (action === 'edit-material') { const m = stockItem(id); if (m) materialModal(m); }
    else if (action === 'delete-material') { const m = stockItem(id); if (m && materialUsed(id)) toast('This material is used by a project or saved build. Reassign it first.', true); else if (m && confirm(`Remove ${stockLabel(m)} from Materials?`)) { state.materials = state.materials.filter(x => x.id !== id); save(); renderApp(); } }
    else if (action === 'clear-filters') { projectSearch = ''; projectStatusFilter = 'all'; renderApp(); }
    else if (action === 'go-materials') { closeModal(); requestBuildExit(() => { currentPage = 'materials'; currentProjectId = null; currentBuildId = null; renderApp(); }); }
    else if (action === 'calculate') calculate();
    else if (action === 'print') window.print();
    else if (action === 'export') exportData();
    else if (action === 'export-recovery') exportRecoveryData();
    else if (action === 'import') $('#import-file').click();
    else if (action === 'close-modal') closeModal();
  });
  root.addEventListener('dragstart', e => { const toolHandle = e.target.closest('[data-tool-drag]'); if (toolboxEditMode && toolHandle) { toolboxDraggedTool = toolHandle.dataset.toolDrag; if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', toolboxDraggedTool); } return; } const handle = e.target.closest('[data-widget-drag]'); if (!dashboardEditMode || !handle) return; dashboardDraggedWidget = handle.dataset.widgetDrag; if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dashboardDraggedWidget); } });
  root.addEventListener('dragover', e => { if (toolboxEditMode && toolboxDraggedTool && e.target.closest('[data-tool-card]')) e.preventDefault(); });
  root.addEventListener('drop', e => { const target = e.target.closest('[data-tool-card]'), moved = toolboxDraggedTool; toolboxDraggedTool = null; if (!toolboxEditMode || !target || !moved || target.dataset.toolCard === moved) return; e.preventDefault(); const previous = state.settings.toolboxTools.slice(), next = previous.filter(id => id !== moved), targetIndex = next.indexOf(target.dataset.toolCard); if (targetIndex < 0) return; next.splice(targetIndex, 0, moved); state.settings.toolboxTools = next; if (!save()) state.settings.toolboxTools = previous; renderApp(); });
  root.addEventListener('dragover', e => { if (dashboardEditMode && dashboardDraggedWidget && e.target.closest('[data-dashboard-widget]')) e.preventDefault(); });
  root.addEventListener('drop', e => { const target = e.target.closest('[data-dashboard-widget]'), moved = dashboardDraggedWidget; dashboardDraggedWidget = null; if (!dashboardEditMode || !target || !moved || target.dataset.dashboardWidget === moved) return; e.preventDefault(); const previous = state.settings.dashboardWidgets.slice(), next = previous.filter(id => id !== moved), targetIndex = next.indexOf(target.dataset.dashboardWidget); if (targetIndex < 0) return; next.splice(targetIndex, 0, moved); state.settings.dashboardWidgets = next; if (!save()) state.settings.dashboardWidgets = previous; renderApp(); });
  root.addEventListener('dragend', () => { dashboardDraggedWidget = null; toolboxDraggedTool = null; });
  $('.sidebar').addEventListener('click', e => { const b = e.target.closest('.nav-item[data-page]'); if (b) { const page = b.dataset.page; requestBuildExit(() => { currentPage = page; currentProjectId = null; currentBuildId = null; currentToolId = null; renderApp(); }); } });
  root.addEventListener('change', e => {
    if (e.target.matches('[data-logo-upload]')) { const file = e.target.files?.[0]; e.target.value = ''; if (file) saveWorkshopLogo(file); return; }
    if (e.target.matches('[data-brand-color]')) { const key = e.target.dataset.brandColor; if (!['primaryColor', 'secondaryColor', 'backgroundColor', 'surfaceColor', 'textColor'].includes(key) || !/^#[0-9a-f]{6}$/i.test(e.target.value)) return; const previous = structuredClone(normalizedBranding(state.settings.branding)); state.settings.branding = { ...previous, [key]: e.target.value }; if (!save()) { state.settings.branding = previous; renderApp(); return; } renderApp(); return; }
    if (e.target.matches('[data-feature-setting]')) { const key = e.target.dataset.featureSetting; if (!Object.hasOwn(DEFAULT_FEATURE_VISIBILITY, key)) return; const previous = state.settings.features[key]; state.settings.features[key] = e.target.checked; if (!save()) state.settings.features[key] = previous; renderApp(); return; }
    if (e.target.matches('[data-cut-tolerance]') || e.target.matches('[data-cut-width-tolerance]')) { const p = project(currentProjectId), value = parseInput(e.target.value); if (!p || value === null || value < 0) { toast('Enter a non-negative stock allowance in the selected units.', true); renderApp(); return; } if (e.target.matches('[data-cut-width-tolerance]')) p.cutWidthTolerance = value; else p.cutTolerance = value; touch(p); const saved = save(); renderApp(); if (saved) toast('Cut allowance saved. Cut layouts updated.'); return; }
    if (e.target.matches('[data-cut-kerf]')) { const p = project(currentProjectId), value = parseInput(e.target.value); if (!p || value === null || value < 0) { toast('Enter a non-negative kerf for the installed blade.', true); renderApp(); return; } p.cutKerf = value; touch(p); const saved = save(); renderApp(); if (saved) toast('Project kerf saved. Cut layout updated.'); return; }
    if (e.target.matches('[data-setting]')) { const k = e.target.dataset.setting, previous = structuredClone(state.settings); if (k === 'units' && ['inches', 'metric'].includes(e.target.value)) state.settings.units = e.target.value; else if (k === 'numberFormat' && ['fraction', 'decimal'].includes(e.target.value) && state.settings.units === 'inches') state.settings.numberFormat = e.target.value; else if (k === 'kerf') { const value = parseInput(e.target.value); if (value === null || value < 0) { toast('Enter a non-negative default saw kerf.', true); renderApp(); return; } state.settings.kerf = value; } else if (k === 'darkMode') state.settings.darkMode = e.target.checked; else if (k === 'materialCardSize' && ['small', 'medium', 'large'].includes(e.target.value)) state.settings.materialCardSize = e.target.value; else return; if (!save()) state.settings = previous; renderApp(); return; }
    if (e.target.matches('[data-cut-visualization]')) { const p = project(currentProjectId); if (p) { p.showCutVisualization = e.target.checked; touch(p); save(); renderApp(); } return; }
    if (e.target.matches('[data-material-type-filter]')) { materialTypeFilter = e.target.value; renderApp(); return; }
    if (e.target.matches('[data-material-thickness-filter]')) { materialThicknessFilter = e.target.value; renderApp(); return; }
    if (e.target.matches('[data-stock-count]')) { const m = stockItem(e.target.dataset.stockCount), n = Number(e.target.value); if (!m) return; if (!Number.isInteger(n) || n < 0 || n > 9999) { toast('Enter a whole number from 0 to 9999.', true); renderApp(); return; } const openGroups = $$('[data-stock-group][open]', root).map(group => group.dataset.stockGroup); m.onHand = n; save(); renderApp(); for (const key of openGroups) { const group = $$('[data-stock-group]', root).find(item => item.dataset.stockGroup === key); if (group) group.open = true; } }
    if (e.target.matches('[data-project-allocation]')) { const p = project(currentProjectId), materialId = e.target.dataset.projectAllocation, n = Number(e.target.value); if (!p || !stockItem(materialId) || !Number.isInteger(n) || n < 0 || n > 9999) { toast('Enter a whole number from 0 to 9999.', true); renderApp(); return; } p.materialAllocations ||= []; const allocation = p.materialAllocations.find(item => item.materialId === materialId); if (allocation) allocation.quantity = n; else p.materialAllocations.push({ materialId, quantity: n }); p.materialAllocations = p.materialAllocations.filter(item => item.quantity > 0); touch(p); save(); renderApp(); }
    if (e.target.id === 'status-filter') { projectStatusFilter = e.target.value; renderApp(); }
    if (e.target.id === 'visibility-filter') { projectVisibilityFilter = e.target.value; renderApp(); }
  });
  root.addEventListener('input', e => { if (e.target.id === 'project-search') { projectSearch = e.target.value; renderApp(); $('#project-search').focus(); } });
  root.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; if (e.target.matches('[data-open-project]')) { const id = e.target.dataset.openProject; requestBuildExit(() => { currentProjectId = id; currentBuildId = null; currentPage = 'projects'; renderApp(); }); } else if (e.target.matches('[data-open-build]')) { const id = e.target.dataset.openBuild; requestBuildExit(() => { currentBuildId = id; currentProjectId = null; currentPage = 'builds'; renderApp(); }); } });
  $('#modal-root').addEventListener('change', e => {
    if (e.target.id === 'wood-type') { const box = $('#wood-custom-wrap'); if (box) box.hidden = e.target.value !== 'Other'; }
  });
  $('#modal-root').addEventListener('click', e => { const materialCard = e.target.closest('[data-select-material]'); if (materialCard) { $('#part-form')?.selectMaterial?.(materialCard.dataset.selectMaterial); return; } if (e.target.closest('[data-action="add-material-from-part"]')) { materialModal(null, created => $('#part-form')?.selectMaterial?.(created.id), true); return; } if (e.target.closest('[data-action="save-build-draft-exit"]')) { resolveBuildExit(true); return; } if (e.target.closest('[data-action="discard-build-draft-exit"]')) { resolveBuildExit(false); return; } if (e.target.closest('[data-action="cancel-build-exit"]')) { closeModal(); return; } if (e.target.closest('[data-action="close-modal"]')) closeModal(); if (e.target.closest('[data-action="go-materials"]')) { closeModal(); requestBuildExit(() => { currentPage = 'materials'; currentProjectId = null; currentBuildId = null; renderApp(); }); } if (e.target.closest('[data-action="delete-project"]')) { const p = project(e.target.closest('[data-action="delete-project"]').dataset.id); if (p && confirm(`Delete “${p.name}” and its parts?`)) { state.projects = state.projects.filter(x => x.id !== p.id); currentProjectId = null; currentPage = 'projects'; closeModal(); save(); renderApp(); } } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  $('#import-file').addEventListener('change', async e => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    try {
      const x = JSON.parse(await f.text());
      if (!isRecord(x) || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(x.version) || !validProjects(x.projects) || !validProjectBuilds(x.projects) || (x.materials !== undefined && !validMaterials(x.materials)) || (x.builds !== undefined && !validBuilds(x.builds)) || (x.settings !== undefined && !isRecord(x.settings))) throw new Error('This file is not a supported BenchPilot or Jabo Workshop backup, or one of its records is incomplete. Your current data was not changed.');
      if (!confirm(`Replace local data with ${x.projects.length} projects, ${x.materials?.length || 0} materials, and ${x.builds?.length || 0} builds? A copy of the current data will download first.`)) return;
      if (storageBlocked) exportRecoveryData(); else downloadText(JSON.stringify({ ...state, app: BRAND.name, exportedAt: new Date().toISOString() }, null, 2), `benchpilot-pre-restore-${new Date().toISOString().slice(0, 10)}.json`);
      if (x.version < 3) for (const p of x.projects) for (const part of p.parts || []) {
        if (part.materialId) { delete part.width; delete part.thickness; }
        else if (part.width !== undefined || part.thickness !== undefined) { part.legacyDimensions = { width: part.width, thickness: part.thickness }; delete part.width; delete part.thickness; }
      }
      const previousState = state, previousBlocked = storageBlocked, previousDirty = storageDirty;
      state = { version: STATE_VERSION, projects: x.projects, materials: x.materials || [], builds: x.builds || [], settings: normalizedSettings(x.settings) };
      if (!['inches', 'metric'].includes(state.settings.units)) state.settings.units = DEFAULT_SETTINGS.units;
      if (!['fraction', 'decimal'].includes(state.settings.numberFormat)) state.settings.numberFormat = DEFAULT_SETTINGS.numberFormat;
      if (!Number.isFinite(Number(state.settings.kerf)) || Number(state.settings.kerf) < 0) state.settings.kerf = DEFAULT_SETTINGS.kerf;
      state.settings.kerf = Number(state.settings.kerf); storageBlocked = false;
      if (!save()) { state = previousState; storageBlocked = previousBlocked; storageDirty = previousDirty; renderApp(); return; }
       loadProblem = ''; storageBlockedReason = ''; currentPage = 'dashboard'; currentProjectId = null; renderApp(); toast('Backup restored.');
    } catch (err) { toast(err.message || 'Could not read that backup.', true); }
  });
  window.addEventListener('beforeunload', e => { if (storageDirty || build(currentBuildId)?.draft?.dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('storage', e => { if (e.key === activeStoreKey()) { state = loadState(activeStoreKey()); renderApp(); if (authUserId) scheduleCloudSync(); } });
  function calculate() { const a = parseInput($('#calc-first').value), b = parseInput($('#calc-second').value); if (a === null || b === null) { toast(`Enter two valid measurements in ${unitName()}.`, true); return; } const n = Math.round((a + ($('#calc-operation').value === 'add' ? b : -b)) * 10000) / 10000; $('#calc-result').textContent = displayMeasure(n); $('#calc-decimal').textContent = `${roundText(state.settings.units === 'metric' ? n * 25.4 : n)} ${unitName()}`; }
  renderApp();
  if (loadProblem) toast(`${loadProblem} The original saved copy was left untouched.`, true);
})();
