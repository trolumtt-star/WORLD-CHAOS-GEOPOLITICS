/**
 * Dünya kayıtları: Supabase (PostgREST) üzerinden, ek paket gerektirmeden fetch ile.
 * Ortam değişkenleri (Render → Environment):
 *   SUPABASE_URL         = https://<proje>.supabase.co
 *   SUPABASE_SECRET_KEY  = sb_secret_...  (ya da eski service_role anahtarı)
 * Tanımlı değilse oyun eskisi gibi sadece bellekte çalışır (kayıt yok).
 */
const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const store = {
  enabled: !!(URL_ && KEY),

  headers(extra = {}) {
    return { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extra };
  },

  async req(path, opts = {}) {
    const res = await fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: this.headers(opts.headers) });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  },

  async save(row) {
    if (!this.enabled) return false;
    await this.req('worlds?on_conflict=code', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
    });
    return true;
  },

  async list(limit = 60) {
    if (!this.enabled) return [];
    return this.req(`worlds?select=code,name,owner_name,locked,sandbox,day,population,player_names,countries,updated_at&order=updated_at.desc&limit=${limit}`);
  },

  async load(code) {
    if (!this.enabled) return null;
    const rows = await this.req(`worlds?code=eq.${encodeURIComponent(code)}&select=state_gz&limit=1`);
    return rows?.[0]?.state_gz ?? null;
  },

  async remove(code) {
    if (!this.enabled) return;
    await this.req(`worlds?code=eq.${encodeURIComponent(code)}`, { method: 'DELETE' });
  },

  async getSetting(key) {
    if (!this.enabled) return null;
    const rows = await this.req(`app_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
    return rows?.[0]?.value ?? null;
  },

  async setSetting(key, value) {
    if (!this.enabled) return;
    await this.req('app_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key, value: String(value), updated_at: new Date().toISOString() }) });
  },

  /** Uzun süredir kimsenin oynamadığı Sandbox dünyalarını temizle */
  async prune() {
    if (!this.enabled) return;
    const sandboxCut = new Date(Date.now() - 3 * 86400e3).toISOString();
    const allCut = new Date(Date.now() - 60 * 86400e3).toISOString();
    await this.req(`worlds?sandbox=eq.true&updated_at=lt.${sandboxCut}`, { method: 'DELETE' });
    await this.req(`worlds?updated_at=lt.${allCut}`, { method: 'DELETE' });
  },
};
