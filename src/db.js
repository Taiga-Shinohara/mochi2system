import { createClient } from '@supabase/supabase-js';

// カテゴリ定義
export const CATEGORIES = {
  food: { name: '食費', icon: '🛒', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  dining: { name: '外食', icon: '🍽️', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  utilities: { name: '水道光熱費', icon: '⚡', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  daily: { name: '日用品', icon: '🧻', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
  housing: { name: '家賃・住まい', icon: '🏠', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  wifi: { name: '通信・ネット', icon: '📶', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)' },
  entertainment: { name: '娯楽・レジャー', icon: '🎬', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' },
  other: { name: 'その他', icon: '🏷️', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)' },
};

// Supabaseテーブルセットアップ用SQL (start_month, end_month 追加)
export const SUPABASE_SETUP_SQL = `-- もちもち生活費 (PairPay) テーブル作成SQL
-- Supabaseの「SQL Editor」に貼り付けて「Run」を押すだけで完了します！

create table if not exists public.pairpay_expenses (
  id text primary key,
  title text not null,
  amount numeric not null,
  paid_by text not null,
  category text not null,
  date text not null,
  split_type text default 'default',
  custom_ratio_a numeric,
  memo text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.pairpay_fixed_costs (
  id text primary key,
  title text not null,
  amount numeric not null,
  paid_by text not null,
  category text not null,
  split_type text default 'default',
  custom_ratio_a numeric,
  start_month text, -- 登録月 (YYYY-MM)
  end_month text,   -- 終了月 (YYYY-MM)
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.pairpay_settings (
  id text primary key,
  partner_a_name text default 'あなた',
  partner_b_name text default 'パートナー',
  default_ratio_a numeric default 60,
  default_ratio_b numeric default 40,
  line_token text,
  line_to text,
  reminder_day numeric default 25,
  line_auto_notify boolean default true,
  settled_months jsonb default '[]'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ふたりで共有利用するためRLSを無効化（すべてのSELECT/INSERT/UPDATE/DELETEを確実に許可）
alter table public.pairpay_expenses disable row level security;
alter table public.pairpay_fixed_costs disable row level security;
alter table public.pairpay_settings disable row level security;

-- 念のためポリシーを全許可で設定
drop policy if exists "Allow all access to expenses" on public.pairpay_expenses;
drop policy if exists "Allow all access to fixed_costs" on public.pairpay_fixed_costs;
drop policy if exists "Allow all access to settings" on public.pairpay_settings;

create policy "Allow all access to expenses" on public.pairpay_expenses for all using (true);
create policy "Allow all access to fixed_costs" on public.pairpay_fixed_costs for all using (true);
create policy "Allow all access to settings" on public.pairpay_settings for all using (true);

alter publication supabase_realtime add table public.pairpay_expenses;
alter publication supabase_realtime add table public.pairpay_fixed_costs;
alter publication supabase_realtime add table public.pairpay_settings;
`;

const LOCAL_STORAGE_KEYS = {
  EXPENSES: 'pairpay_expenses_v1',
  FIXED_COSTS: 'pairpay_fixed_costs_v1',
  SETTINGS: 'pairpay_settings_v1',
  SUPABASE_CONFIG: 'pairpay_supabase_cfg_v1',
  DELETED_EXPENSES: 'pairpay_deleted_exp_ids_v1',
  DELETED_FIXED: 'pairpay_deleted_fc_ids_v1',
  SETTLED_MONTHS: 'pairpay_settled_months_v1'
};

export class StorageService {
  constructor() {
    this.supabase = null;
    this.isConnected = false;
    this.onSyncCallback = null;
    this.channel = null;

    this.settings = this.loadSettings();
    this.initPromise = this.initSupabaseIfConfigured();
  }

  getDeletedIds(type) {
    const key = type === 'expenses' ? LOCAL_STORAGE_KEYS.DELETED_EXPENSES : LOCAL_STORAGE_KEYS.DELETED_FIXED;
    try {
      const data = localStorage.getItem(key);
      return data ? new Set(JSON.parse(data)) : new Set();
    } catch {
      return new Set();
    }
  }

  addDeletedId(type, id) {
    const key = type === 'expenses' ? LOCAL_STORAGE_KEYS.DELETED_EXPENSES : LOCAL_STORAGE_KEYS.DELETED_FIXED;
    const ids = this.getDeletedIds(type);
    ids.add(String(id));
    localStorage.setItem(key, JSON.stringify([...ids]));
  }

  removeDeletedId(type, id) {
    const key = type === 'expenses' ? LOCAL_STORAGE_KEYS.DELETED_EXPENSES : LOCAL_STORAGE_KEYS.DELETED_FIXED;
    const ids = this.getDeletedIds(type);
    if (ids.has(String(id))) {
      ids.delete(String(id));
      localStorage.setItem(key, JSON.stringify([...ids]));
    }
  }

  setSyncCallback(cb) {
    this.onSyncCallback = cb;
  }

  getSettledMonths() {
    try {
      const fromSettings = this.settings?.settledMonths;
      if (Array.isArray(fromSettings)) return fromSettings;
      const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.SETTLED_MONTHS);
      if (raw) return JSON.parse(raw);
    } catch {
      // fallback
    }
    return [];
  }

  isMonthSettled(month) {
    if (!month) return false;
    const list = this.getSettledMonths();
    return list.includes(month);
  }

  async setMonthSettled(month, isSettled = true) {
    if (!month) return;
    const current = new Set(this.getSettledMonths());
    if (isSettled) {
      current.add(month);
    } else {
      current.delete(month);
    }
    const updatedList = Array.from(current).sort();
    this.settings.settledMonths = updatedList;
    localStorage.setItem(LOCAL_STORAGE_KEYS.SETTLED_MONTHS, JSON.stringify(updatedList));
    this.saveSettings({ settledMonths: updatedList });
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.settledMonths) {
          const rawSettled = localStorage.getItem(LOCAL_STORAGE_KEYS.SETTLED_MONTHS);
          if (rawSettled) parsed.settledMonths = JSON.parse(rawSettled);
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse settings', e);
    }
    return {
      partnerAName: 'あなた (A)',
      partnerBName: 'パートナー (B)',
      defaultRatioA: 60,
      defaultRatioB: 40,
      lineToken: '',
      lineTo: '',
      reminderDay: 25,
      lineAutoNotify: true,
      appUrl: '',
      settledMonths: []
    };
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    localStorage.setItem(LOCAL_STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
    if (this.settings.settledMonths) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.SETTLED_MONTHS, JSON.stringify(this.settings.settledMonths));
    }
    if (this.supabase && this.isConnected) {
      const payload = {
        id: 'global_settings',
        partner_a_name: this.settings.partnerAName,
        partner_b_name: this.settings.partnerBName,
        default_ratio_a: this.settings.defaultRatioA,
        default_ratio_b: this.settings.defaultRatioB,
        line_token: this.settings.lineToken || '',
        line_to: this.settings.lineTo || '',
        reminder_day: this.settings.reminderDay || 25,
        line_auto_notify: this.settings.lineAutoNotify !== false,
        app_url: this.settings.appUrl || '',
        settled_months: this.settings.settledMonths || [],
        updated_at: new Date().toISOString()
      };
      this.supabase.from('pairpay_settings').upsert(payload).catch(() => {
        // もしsettled_monthsやapp_urlカラムがなくてもエラーで止まらないようフォールバック
        delete payload.settled_months;
        delete payload.app_url;
        return this.supabase.from('pairpay_settings').upsert(payload);
      }).then();
    }
  }

  getSupabaseConfig() {
    try {
      const cfg = localStorage.getItem(LOCAL_STORAGE_KEYS.SUPABASE_CONFIG);
      return cfg ? JSON.parse(cfg) : { url: '', key: '' };
    } catch {
      return { url: '', key: '' };
    }
  }

  async saveSupabaseConfig(url, key) {
    const res = await this.initSupabase(url, key);
    if (res.success) {
      if (url && key) {
        localStorage.setItem(LOCAL_STORAGE_KEYS.SUPABASE_CONFIG, JSON.stringify({ url, key }));
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEYS.SUPABASE_CONFIG);
      }
    }
    return res;
  }

  async initSupabaseIfConfigured() {
    const { url, key } = this.getSupabaseConfig();
    if (url && key) {
      return await this.initSupabase(url, key);
    }
    return { success: false, reason: 'NOT_CONFIGURED' };
  }

  async initSupabase(url, key) {
    if (!url || !key) {
      if (this.channel && this.supabase) {
        this.supabase.removeChannel(this.channel);
      }
      this.supabase = null;
      this.isConnected = false;
      return { success: true, disconnected: true };
    }
    try {
      const client = createClient(url, key);
      // テーブル接続テスト
      const { data, error } = await client.from('pairpay_expenses').select('id').limit(1);
      if (error && error.code !== 'PGRST116') {
        console.error('Supabase test select error', error);
        this.isConnected = false;
        this.supabase = null;
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return {
            success: false,
            errorType: 'TABLE_NOT_FOUND',
            error: 'テーブルが作成されていません。SQL Editorでテーブル作成SQLを実行してください。'
          };
        }
        return {
          success: false,
          errorType: 'AUTH_OR_URL_ERROR',
          error: `接続エラー: ${error.message || 'URLまたはキーが不正です'}`
        };
      }

      this.supabase = client;
      this.isConnected = true;
      this.setupRealtimeSubscription();

      // 初期同期（Supabaseとローカルの双方向データ同期）
      await this.syncInitialData();

      return { success: true };
    } catch (err) {
      console.error('Supabase init failed', err);
      this.isConnected = false;
      this.supabase = null;
      return { success: false, errorType: 'EXCEPTION', error: err.message || '接続に失敗しました' };
    }
  }

  /**
   * Supabase接続直後の初期同期
   * - Supabaseにデータがあれば取得してローカルに反映
   * - Supabaseが空でローカルにデータがあれば、既存データをSupabaseへ移行アップロード
   * - 設定（名前、比率等）も同期
   */
  async syncInitialData() {
    if (!this.isConnected || !this.supabase) return;

    try {
      // 1. 設定の同期
      const { data: remoteSettings } = await this.supabase
        .from('pairpay_settings')
        .select('*')
        .eq('id', 'global_settings')
        .maybeSingle();

      if (remoteSettings) {
        this.settings = {
          ...this.settings,
          partnerAName: remoteSettings.partner_a_name || this.settings.partnerAName,
          partnerBName: remoteSettings.partner_b_name || this.settings.partnerBName,
          defaultRatioA: Number(remoteSettings.default_ratio_a) || this.settings.defaultRatioA,
          defaultRatioB: Number(remoteSettings.default_ratio_b) || this.settings.defaultRatioB,
          lineToken: remoteSettings.line_token || this.settings.lineToken,
          lineTo: remoteSettings.line_to || this.settings.lineTo,
          reminderDay: Number(remoteSettings.reminder_day) || this.settings.reminderDay,
          lineAutoNotify: remoteSettings.line_auto_notify !== false,
          appUrl: remoteSettings.app_url || this.settings.appUrl || '',
          settledMonths: Array.isArray(remoteSettings.settled_months)
            ? remoteSettings.settled_months
            : (this.settings.settledMonths || this.getSettledMonths() || [])
        };
        localStorage.setItem(LOCAL_STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
        if (this.settings.settledMonths) {
          localStorage.setItem(LOCAL_STORAGE_KEYS.SETTLED_MONTHS, JSON.stringify(this.settings.settledMonths));
        }
      } else {
        // クラウド側に設定がなければローカル設定を保存
        await this.supabase.from('pairpay_settings').upsert({
          id: 'global_settings',
          partner_a_name: this.settings.partnerAName,
          partner_b_name: this.settings.partnerBName,
          default_ratio_a: this.settings.defaultRatioA,
          default_ratio_b: this.settings.defaultRatioB,
          line_token: this.settings.lineToken || '',
          line_to: this.settings.lineTo || '',
          reminder_day: this.settings.reminderDay || 25,
          line_auto_notify: this.settings.lineAutoNotify !== false,
          app_url: this.settings.appUrl || '',
          updated_at: new Date().toISOString()
        }).catch(() => {});
      }

      // 2. 支出 (Expenses) の同期
      const { data: remoteExpenses, error: expErr } = await this.supabase
        .from('pairpay_expenses')
        .select('*')
        .order('date', { ascending: false });

      if (!expErr && remoteExpenses) {
        const mapped = remoteExpenses.map(d => ({
          id: d.id,
          title: d.title,
          amount: Number(d.amount),
          paidBy: d.paid_by,
          category: d.category,
          date: d.date,
          splitType: d.split_type,
          customRatioA: d.custom_ratio_a != null ? Number(d.custom_ratio_a) : null,
          memo: d.memo
        }));
        localStorage.setItem(LOCAL_STORAGE_KEYS.EXPENSES, JSON.stringify(mapped));
      }

      // 3. 固定費 (Fixed Costs) の同期
      const { data: remoteFixed, error: fixErr } = await this.supabase
        .from('pairpay_fixed_costs')
        .select('*');

      if (!fixErr && remoteFixed) {
        const mapped = remoteFixed.map(d => ({
          id: d.id,
          title: d.title,
          amount: Number(d.amount),
          paidBy: d.paid_by,
          category: d.category,
          splitType: d.split_type,
          customRatioA: d.custom_ratio_a != null ? Number(d.custom_ratio_a) : null,
          startMonth: d.start_month || '2026-01',
          endMonth: d.end_month || null,
          active: d.active
        }));
        localStorage.setItem(LOCAL_STORAGE_KEYS.FIXED_COSTS, JSON.stringify(mapped));
      }
    } catch (syncErr) {
      console.warn('Initial sync warning:', syncErr);
    }
  }

  setupRealtimeSubscription() {
    if (!this.supabase) return;
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
    }
    this.channel = this.supabase
      .channel('pairpay_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pairpay_expenses' }, async () => {
        await this.syncInitialData();
        if (this.onSyncCallback) this.onSyncCallback('expenses');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pairpay_fixed_costs' }, async () => {
        await this.syncInitialData();
        if (this.onSyncCallback) this.onSyncCallback('fixed_costs');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pairpay_settings' }, async () => {
        await this.syncInitialData();
        if (this.onSyncCallback) this.onSyncCallback('settings');
      })
      .subscribe();
  }

  // 支出 (Expenses)
  async getExpenses() {
    if (this.initPromise) {
      await this.initPromise;
    }
    if (this.isConnected && this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('pairpay_expenses')
          .select('*')
          .order('date', { ascending: false });
        if (!error && data) {
          const mapped = data.map(d => ({
            id: d.id,
            title: d.title,
            amount: Number(d.amount),
            paidBy: d.paid_by,
            category: d.category,
            date: d.date,
            splitType: d.split_type,
            customRatioA: d.custom_ratio_a != null ? Number(d.custom_ratio_a) : null,
            memo: d.memo
          }));
          localStorage.setItem(LOCAL_STORAGE_KEYS.EXPENSES, JSON.stringify(mapped));
          return mapped;
        }
      } catch (e) {
        console.warn('Supabase getExpenses failed', e);
      }
    }
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEYS.EXPENSES);
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  }

  async saveExpense(expense) {
    const current = await this.getExpenses();
    const idx = current.findIndex(e => String(e.id) === String(expense.id));
    const isUpdate = idx >= 0;

    let updated;
    if (isUpdate) {
      updated = [...current];
      updated[idx] = expense;
    } else {
      updated = [expense, ...current];
    }
    localStorage.setItem(LOCAL_STORAGE_KEYS.EXPENSES, JSON.stringify(updated));

    if (this.isConnected && this.supabase) {
      try {
        const payload = {
          id: expense.id,
          title: expense.title,
          amount: expense.amount,
          paid_by: expense.paidBy,
          category: expense.category,
          date: expense.date,
          split_type: expense.splitType || 'default',
          custom_ratio_a: expense.customRatioA,
          memo: expense.memo || ''
        };

        if (isUpdate) {
          // 既存項目の確実な更新（UPDATEを発行して新規行の増殖を防止）
          const { error } = await this.supabase
            .from('pairpay_expenses')
            .update(payload)
            .eq('id', expense.id);
          if (error) {
            console.warn('Supabase update failed, attempting upsert', error);
            await this.supabase.from('pairpay_expenses').upsert(payload, { onConflict: 'id' });
          }
        } else {
          // 新規項目の作成
          const { error } = await this.supabase
            .from('pairpay_expenses')
            .insert(payload);
          if (error) {
            console.warn('Supabase insert failed, attempting upsert', error);
            await this.supabase.from('pairpay_expenses').upsert(payload, { onConflict: 'id' });
          }
        }
      } catch (e) {
        console.error('Supabase saveExpense error', e);
      }
    }
    return updated;
  }

  async deleteExpense(id) {
    const strId = String(id);

    if (this.isConnected && this.supabase) {
      try {
        const { error } = await this.supabase.from('pairpay_expenses').delete().eq('id', strId);
        if (error) {
          console.error('Supabase deleteExpense error:', error);
          if (error.code === '42501' || error.message?.includes('violates row-level security')) {
            alert('⚠️ Supabaseの権限設定（RLS）によりクラウド側での削除が拒否されました。\n「同期設定」画面の最新SQLを実行してRLSを無効化してください。');
          }
        }
      } catch (e) {
        console.error('Supabase deleteExpense exception:', e);
      }
    }

    const current = await this.getExpenses();
    const updated = current.filter(e => String(e.id) !== strId);
    localStorage.setItem(LOCAL_STORAGE_KEYS.EXPENSES, JSON.stringify(updated));
    return updated;
  }

  // 固定費 (Fixed Costs)
  async getFixedCosts() {
    if (this.initPromise) {
      await this.initPromise;
    }
    if (this.isConnected && this.supabase) {
      try {
        const { data, error } = await this.supabase.from('pairpay_fixed_costs').select('*');
        if (!error && data) {
          const mapped = data.map(d => ({
            id: d.id,
            title: d.title,
            amount: Number(d.amount),
            paidBy: d.paid_by,
            category: d.category,
            splitType: d.split_type,
            customRatioA: d.custom_ratio_a != null ? Number(d.custom_ratio_a) : null,
            startMonth: d.start_month || '2026-01',
            endMonth: d.end_month || null,
            active: d.active
          }));
          localStorage.setItem(LOCAL_STORAGE_KEYS.FIXED_COSTS, JSON.stringify(mapped));
          return mapped;
        }
      } catch (e) {
        console.warn('Supabase getFixedCosts failed', e);
      }
    }
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEYS.FIXED_COSTS);
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  }

  async saveFixedCost(cost) {
    const current = await this.getFixedCosts();
    const idx = current.findIndex(c => String(c.id) === String(cost.id));
    const isUpdate = idx >= 0;

    let updated;
    if (isUpdate) {
      updated = [...current];
      updated[idx] = cost;
    } else {
      updated = [...current, cost];
    }
    localStorage.setItem(LOCAL_STORAGE_KEYS.FIXED_COSTS, JSON.stringify(updated));

    if (this.isConnected && this.supabase) {
      try {
        const payload = {
          id: cost.id,
          title: cost.title,
          amount: cost.amount,
          paid_by: cost.paidBy,
          category: cost.category,
          split_type: cost.splitType || 'default',
          custom_ratio_a: cost.customRatioA,
          start_month: cost.startMonth || '2026-01',
          end_month: cost.endMonth || null,
          active: cost.active !== false
        };

        if (isUpdate) {
          // 既存固定費の確実な更新（UPDATEを発行）
          const { error } = await this.supabase
            .from('pairpay_fixed_costs')
            .update(payload)
            .eq('id', cost.id);
          if (error) {
            console.warn('Supabase update fixed cost failed, attempting upsert', error);
            await this.supabase.from('pairpay_fixed_costs').upsert(payload, { onConflict: 'id' });
          }
        } else {
          // 新規固定費の作成
          const { error } = await this.supabase
            .from('pairpay_fixed_costs')
            .insert(payload);
          if (error) {
            console.warn('Supabase insert fixed cost failed, attempting upsert', error);
            await this.supabase.from('pairpay_fixed_costs').upsert(payload, { onConflict: 'id' });
          }
        }
      } catch (e) {
        console.error('Supabase saveFixedCost error', e);
      }
    }
    return updated;
  }

  /**
   * 固定費の削除
   * 登録月より後の月で削除された場合は、その月以降のみ除外されるよう endMonth を設定。
   * 登録月に削除された場合はレコード自体を削除。
   */
  async deleteFixedCost(id, fromMonth = null) {
    const strId = String(id);
    const current = await this.getFixedCosts();
    const target = current.find(c => String(c.id) === strId);

    if (target && fromMonth && target.startMonth && target.startMonth < fromMonth) {
      // 過去の月には残し、当月(fromMonth)以降のみ終了扱いにする
      target.endMonth = fromMonth;
      return await this.saveFixedCost(target);
    } else {
      if (this.isConnected && this.supabase) {
        try {
          const { error } = await this.supabase.from('pairpay_fixed_costs').delete().eq('id', strId);
          if (error) {
            console.error('Supabase deleteFixedCost error:', error);
            if (error.code === '42501' || error.message?.includes('violates row-level security')) {
              alert('⚠️ Supabaseの権限設定（RLS）によりクラウド側での削除が拒否されました。\n「同期設定」画面の最新SQLを実行してRLSを無効化してください。');
            }
          }
        } catch (e) {
          console.error('Supabase deleteFixedCost exception:', e);
        }
      }

      const updated = current.filter(c => String(c.id) !== strId);
      localStorage.setItem(LOCAL_STORAGE_KEYS.FIXED_COSTS, JSON.stringify(updated));
      return updated;
    }
  }

  // デモデータ生成
  async loadDemoData(currentMonth) {
    // 【本番データ保護】クラウド同期中、またはSupabase設定済みの場合は絶対にダミーデータを投入しない
    if (this.isConnected || this.getSupabaseConfig().url) {
      console.warn('クラウド同期が有効なため、ダミーデータの投入をスキップしました。本番DBを保護しています。');
      return;
    }

    const demoFixed = [
      { id: 'fx_1', title: '賃貸マンション家賃', amount: 96000, paidBy: 'A', category: 'housing', splitType: 'default', startMonth: currentMonth, endMonth: null, active: true },
      { id: 'fx_2', title: '光回線インターネット', amount: 5200, paidBy: 'B', category: 'wifi', splitType: 'half', startMonth: currentMonth, endMonth: null, active: true },
      { id: 'fx_3', title: '動画・音楽サブスク共有', amount: 1980, paidBy: 'B', category: 'entertainment', splitType: 'half', startMonth: currentMonth, endMonth: null, active: true },
    ];

    const demoExpenses = [
      { id: 'exp_1', title: 'スーパーで週末食材まとめ買い', amount: 8420, paidBy: 'A', category: 'food', date: `${currentMonth}-03`, splitType: 'default' },
      { id: 'exp_2', title: 'ドラッグストアで日用品', amount: 3280, paidBy: 'B', category: 'daily', date: `${currentMonth}-06`, splitType: 'default' },
      { id: 'exp_3', title: '東京電力（電気代検針分）', amount: 7650, paidBy: 'A', category: 'utilities', date: `${currentMonth}-10`, splitType: 'default' },
      { id: 'exp_4', title: '東京ガス（ガス代）', amount: 4890, paidBy: 'A', category: 'utilities', date: `${currentMonth}-11`, splitType: 'default' },
      { id: 'exp_5', title: '記念日ディナー外食', amount: 12400, paidBy: 'B', category: 'dining', date: `${currentMonth}-14`, splitType: 'half' },
      { id: 'exp_6', title: '無印良品 収納ケース等', amount: 4500, paidBy: 'B', category: 'daily', date: `${currentMonth}-16`, splitType: 'default' },
    ];

    for (const f of demoFixed) {
      await this.saveFixedCost(f);
    }
    for (const e of demoExpenses) {
      await this.saveExpense(e);
    }
  }

  async clearAll() {
    localStorage.removeItem(LOCAL_STORAGE_KEYS.EXPENSES);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.FIXED_COSTS);
    if (this.isConnected && this.supabase) {
      try {
        await this.supabase.from('pairpay_expenses').delete().neq('id', '___');
        await this.supabase.from('pairpay_fixed_costs').delete().neq('id', '___');
      } catch (e) {
        console.error('Supabase clear error', e);
      }
    }
  }
}
