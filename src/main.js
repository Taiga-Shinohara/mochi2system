import './style.css';
import confetti from 'canvas-confetti';
import { StorageService, CATEGORIES, SUPABASE_SETUP_SQL } from './db.js';
import { calculateSettlement, generateShareText, calculateMultiMonthTrends } from './calculator.js';
import { renderMochiDog, renderCaption } from './characters.js';
import { LineService } from './lineService.js';

function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentMonthString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

class MochiBudgetApp {
  constructor() {
    this.storage = new StorageService();
    this.currentMonth = getCurrentMonthString();
    this.activeTab = 'all';
    this.selectedCategoryFilter = 'all';
    this.viewMode = 'monthly'; // 'monthly' | 'trends'

    this.expenses = [];
    this.fixedCosts = [];
    this.settings = this.storage.settings;

    this.isSelectMode = false;
    this.selectedIds = new Set();
    this.seesawScope = 'variable'; // デフォルトは「変動費のみ」

    this.lineService = new LineService(() => this.settings);

    this.init();
  }

  async init() {
    // 1. URLパラメータからのSupabaseワンタップ連携チェック
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('supabase_url');
    const sharedKey = params.get('supabase_key');
    if (sharedUrl && sharedKey) {
      const res = await this.storage.saveSupabaseConfig(sharedUrl, sharedKey);
      window.history.replaceState({}, document.title, window.location.pathname);
      if (res && res.success) {
        this.showToast('🎉 クラウド同期につながりました！');
      } else {
        alert(res?.error || 'Supabaseへの接続に失敗しました');
      }
    } else {
      await this.storage.initPromise;
    }

    this.storage.setSyncCallback(async () => {
      this.showToast('もちもち同期しましたよ');
      await this.loadData();
      this.render();
      this.attachEventListeners();
    });

    await this.loadData();

    // デモデータのロードは、Supabase未設定かつ初回訪問時（ローカルにも一切データがない場合）のみ
    const onboardingDone = localStorage.getItem('pairpay_onboarding_done');
    const hasSupabase = Boolean(this.storage.getSupabaseConfig().url);
    if (!this.storage.isConnected && !hasSupabase && !onboardingDone && this.expenses.length === 0 && this.fixedCosts.length === 0) {
      await this.storage.loadDemoData(this.currentMonth);
      localStorage.setItem('pairpay_onboarding_done', '1');
      await this.loadData();
    }

    this.render();
    this.attachEventListeners();
    this.checkReminder();
  }

  async loadData() {
    this.expenses = await this.storage.getExpenses();
    this.fixedCosts = await this.storage.getFixedCosts();
    this.settings = this.storage.settings;
  }

  showToast(message) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  changeMonth(delta) {
    const [yearStr, monthStr] = this.currentMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) + delta;
    if (month > 12) {
      month = 1;
      year += 1;
    } else if (month < 1) {
      month = 12;
      year -= 1;
    }
    this.currentMonth = `${year}-${String(month).padStart(2, '0')}`;
    this.render();
    this.attachEventListeners();
  }

  formatMonthDisplay(monthStr) {
    const [y, m] = monthStr.split('-');
    return `${y}年${parseInt(m, 10)}月`;
  }

  // リマインド日の自動チェック
  checkReminder() {
    const today = new Date();
    const reminderDay = Number(this.settings.reminderDay) || 25;
    const currentDay = today.getDate();

    // 当日の場合、かつ本日まだ通知していない場合に送信
    if (currentDay === reminderDay && this.lineService.isConfigured()) {
      const lastSentKey = `mochi_reminder_${this.currentMonth}`;
      if (!localStorage.getItem(lastSentKey)) {
        const calc = calculateSettlement({
          expenses: this.expenses,
          fixedCosts: this.fixedCosts,
          settings: this.settings,
          currentMonth: this.currentMonth
        });
        this.lineService.sendSettlementReminder(calc, this.settings, this.formatMonthDisplay(this.currentMonth));
        localStorage.setItem(lastSentKey, 'true');
      }
    }
  }

  render() {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    const calcAll = calculateSettlement({
      expenses: this.expenses,
      fixedCosts: this.fixedCosts,
      settings: this.settings,
      currentMonth: this.currentMonth
    });

    const calcVariable = calculateSettlement({
      expenses: this.expenses,
      fixedCosts: [],
      settings: this.settings,
      currentMonth: this.currentMonth
    });

    const calc = calcAll;
    const activeCalc = this.seesawScope === 'all' ? calcAll : calcVariable;

    const isConnected = this.storage.isConnected;
    const isSettled = this.storage.isMonthSettled(this.currentMonth);
    const { partnerAName, partnerBName, defaultRatioA, defaultRatioB } = this.settings;
    const actualCurrentMonth = getCurrentMonthString();
    const isViewingOtherMonth = this.currentMonth !== actualCurrentMonth;

    // もし月別推移・一覧ビューが選択されている場合
    if (this.viewMode === 'trends') {
      appEl.innerHTML = `
        <header class="app-header">
          <div class="brand" id="btnLogo">
            <img src="/characters/mochi-smile.png" class="brand-icon" alt="もちもち犬" />
            <span class="brand-title">もちもち生活費</span>
          </div>
          <div class="header-actions">
            <button class="sync-badge" id="btnOpenSync" title="同期設定">
              <span class="sync-dot ${isConnected ? 'connected' : ''}"></span>
              <span>${isConnected ? '同期中' : '端末保存'}</span>
            </button>
            <button class="icon-btn" id="btnOpenSettings" title="設定・比率・LINE">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </header>

        <!-- ビュー切替トグル（月ごとの精算 vs 月別推移・一覧） -->
        <div class="view-switch-container">
          <div class="view-switch-control">
            <button type="button" class="view-switch-btn" id="btnViewMonthly">
              <span>📅 月の精算</span>
            </button>
            <button type="button" class="view-switch-btn active" id="btnViewTrends">
              <span>📈 月別推移・一覧</span>
            </button>
          </div>
        </div>

        ${this.renderTrendsContent()}
      `;
      return;
    }

    let displayedItems = calc.allItems;
    if (this.activeTab === 'variable') {
      displayedItems = displayedItems.filter(i => !i.isFixed);
    } else if (this.activeTab === 'fixed') {
      displayedItems = displayedItems.filter(i => i.isFixed);
    }

    if (this.selectedCategoryFilter !== 'all') {
      displayedItems = displayedItems.filter(i => i.category === this.selectedCategoryFilter);
    }

    // 犬のポーズ決定（選択中の集計対象に基づく）
    let dogPose = 'calm';
    let captionText = 'わかっていますよ';

    // 遊具風シーソーの傾き角度計算（選択中の集計で立替金額が大きい側が重みで沈み込む）
    let tiltDeg = 0;
    if (activeCalc.status !== 'even' && activeCalc.transferAmount > 0) {
      const maxTilt = 9; // 最大9度の自然で愛らしい傾斜
      const severity = Math.min(1, activeCalc.transferAmount / 25000);
      const angle = Math.max(3, Math.round(severity * maxTilt));
      // balanceA > 0 のとき A が立替中（左が沈む = -angle）
      tiltDeg = activeCalc.balanceA > 0 ? -angle : angle;
    }

    if (activeCalc.status === 'even') {
      dogPose = 'smile';
      captionText = 'でも幸せならOKです';
    } else if (activeCalc.transferAmount > 40000) {
      dogPose = 'panic';
      captionText = 'あと30分…あと30分…';
    } else if (activeCalc.transferAmount > 20000) {
      dogPose = 'sad';
      captionText = '世知辛い';
    } else {
      dogPose = 'calm';
      captionText = 'わかっていますよ';
    }

    appEl.innerHTML = `
      <header class="app-header">
        <div class="brand" id="btnLogo">
          <img src="/characters/mochi-smile.png" class="brand-icon" alt="もちもち犬" />
          <span class="brand-title">もちもち生活費</span>
        </div>
        <div class="header-actions">
          <button class="sync-badge" id="btnOpenSync" title="同期設定">
            <span class="sync-dot ${isConnected ? 'connected' : ''}"></span>
            <span>${isConnected ? '同期中' : '端末保存'}</span>
          </button>
          <button class="icon-btn" id="btnOpenSettings" title="設定・比率・LINE">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      <!-- ビュー切替トグル（月ごとの精算 vs 月別推移・一覧） -->
      <div class="view-switch-container">
        <div class="view-switch-control">
          <button type="button" class="view-switch-btn active" id="btnViewMonthly">
            <span>📅 月の精算</span>
          </button>
          <button type="button" class="view-switch-btn" id="btnViewTrends">
            <span>📈 月別推移・一覧</span>
          </button>
        </div>
      </div>

      <!-- 月ナビゲーション -->
      <div class="month-nav-container">
        <div class="month-nav-left">
          <div class="month-selector">
            <button class="month-btn" id="btnPrevMonth">◀</button>
            <span class="current-month-label">${this.formatMonthDisplay(this.currentMonth)}</span>
            <button class="month-btn" id="btnNextMonth">▶</button>
          </div>
          ${isViewingOtherMonth ? `
            <button class="btn-secondary btn-return-month" id="btnReturnToCurrentMonth">
              今月に戻る 📅
            </button>
          ` : ''}
        </div>
        <div class="quick-stats-badge">
          比率: ${partnerAName} ${defaultRatioA}% : ${partnerBName} ${defaultRatioB}%
        </div>
      </div>

      <main>
        <!-- ヒーロー精算カード -->
        <section class="mochi-card settlement-hero">
          ${isSettled ? `
            <div class="settled-lock-banner">
              <span>🔒</span>
              <span><strong>${this.formatMonthDisplay(this.currentMonth)}</strong> は精算完了・固定済みです（項目の追加・変更ロック中）</span>
            </div>
          ` : ''}

          <div class="hero-character-wrapper">
            ${renderMochiDog(dogPose, 140, 'mochi-float')}
            ${renderCaption(captionText)}
          </div>

          <div class="settlement-amount-box">
            <div style="font-size: 0.78rem; font-weight: 800; color: var(--mochi-ink-sub); margin-bottom: 2px;">
              ${this.seesawScope === 'variable' ? '⚡ 変動費（日常のお買い物・外食）の精算' : '🏠＋⚡ 全体の精算（固定費＋変動費）'}
            </div>
            ${activeCalc.status === 'even' ? `
              <div class="settlement-subtitle">今月の精算はぴったりです</div>
              <div class="settlement-title even">
                <span>イーブンですよ</span>
              </div>
            ` : `
              <div class="settlement-subtitle">
                <strong>${activeCalc.payerName}</strong> から <strong>${activeCalc.receiverName}</strong> へのお支払い
              </div>
              <div class="settlement-title">
                <span class="yen-mark">¥</span>
                <span>${activeCalc.transferAmount.toLocaleString()}</span>
              </div>
            `}
          </div>

          <!-- 遊具風精算シーソー（両脇に犬・立替が多い人が沈み込む） -->
          <div class="seesaw-container">
            <!-- シーソー集計範囲切替（変動費のみ vs すべて含む） -->
            <div class="seesaw-scope-bar">
              <div class="seesaw-scope-toggle">
                <button type="button" class="seesaw-scope-btn ${this.seesawScope === 'variable' ? 'active' : ''}" data-scope="variable">
                  <span>⚡ 変動費のみ (日常の立替)</span>
                </button>
                <button type="button" class="seesaw-scope-btn ${this.seesawScope === 'all' ? 'active' : ''}" data-scope="all">
                  <span>🏠＋⚡ すべて (固定費含む)</span>
                </button>
              </div>
            </div>

            <div class="seesaw-partners-row">
              <span class="partner-pill a">🐾 ${partnerAName}</span>
              <span class="seesaw-status-tag ${activeCalc.status === 'even' ? 'even' : (activeCalc.balanceA > 0 ? 'a-heavy' : 'b-heavy')}">
                ${activeCalc.status === 'even' ? '⚖️ つり合っています' : (activeCalc.balanceA > 0 ? `🐾 ${partnerAName} が立替中` : `🐾 ${partnerBName} が立替中`)}
              </span>
              <span class="partner-pill b">🐾 ${partnerBName}</span>
            </div>

            <!-- 遊具シーソー本体 -->
            <div class="playground-seesaw-wrapper">
              <div class="seesaw-plank" style="transform: rotate(${tiltDeg}deg);">
                <!-- A側の席 & 犬アイコン -->
                <div class="seesaw-seat seat-a">
                  <div class="seesaw-dog-rider">
                    <img src="/characters/mochi-smile.png" alt="${partnerAName}" class="dog-rider-img ${activeCalc.balanceA > 0 ? 'heavy-sink' : ''}" />
                    <span class="seat-badge ${activeCalc.balanceA >= 0 ? 'plus' : 'minus'}">
                      ${activeCalc.balanceA >= 0 ? `+¥${activeCalc.balanceA.toLocaleString()}` : `-¥${Math.abs(activeCalc.balanceA).toLocaleString()}`}
                    </span>
                  </div>
                  <div class="seat-handle"></div>
                </div>

                <!-- シーソーの木製板 & 中心ピン -->
                <div class="seesaw-bar">
                  <div class="seesaw-pivot-pin"></div>
                </div>

                <!-- B側の席 & 犬アイコン -->
                <div class="seesaw-seat seat-b">
                  <div class="seesaw-dog-rider">
                    <img src="/characters/mochi-stretch.png" alt="${partnerBName}" class="dog-rider-img ${activeCalc.balanceB > 0 ? 'heavy-sink' : ''}" />
                    <span class="seat-badge ${activeCalc.balanceB >= 0 ? 'plus' : 'minus'}">
                      ${activeCalc.balanceB >= 0 ? `+¥${activeCalc.balanceB.toLocaleString()}` : `-¥${Math.abs(activeCalc.balanceB).toLocaleString()}`}
                    </span>
                  </div>
                  <div class="seat-handle"></div>
                </div>
              </div>

              <!-- 支点（三角の土台）と地面 -->
              <div class="seesaw-base-fulcrum">
                <div class="fulcrum-triangle"></div>
                <div class="fulcrum-ground-line"></div>
              </div>
            </div>

            <div class="seesaw-labels">
              <span>${activeCalc.balanceA > 0 ? '⬇️ 立替が多くて沈み中' : (activeCalc.balanceA < 0 ? '⬆️ 浮き中' : '均等')}</span>
              <span style="font-weight: 800; color: var(--mochi-ink);">${activeCalc.status === 'even' ? 'イーブン（0円）' : `差額: ¥${activeCalc.transferAmount.toLocaleString()}`}</span>
              <span>${activeCalc.balanceB > 0 ? '⬇️ 立替が多くて沈み中' : (activeCalc.balanceB < 0 ? '⬆️ 浮き中' : '均等')}</span>
            </div>
          </div>

          <!-- 2人の状況 -->
          <div class="dual-status-grid">
            <div class="person-card a">
              <div class="person-header">
                <span class="person-name">${partnerAName}</span>
                <span class="person-ratio-tag">${defaultRatioA}%</span>
              </div>
              <div class="person-paid-val">¥${activeCalc.totalPaidA.toLocaleString()}</div>
              <div class="person-goal-val">目安: ¥${activeCalc.totalOwedA.toLocaleString()}</div>
              <div class="person-diff-val ${activeCalc.balanceA >= 0 ? 'plus' : 'minus'}">
                ${activeCalc.balanceA >= 0 ? `+¥${activeCalc.balanceA.toLocaleString()} (立替)` : `-¥${Math.abs(activeCalc.balanceA).toLocaleString()} (不足)`}
              </div>
            </div>

            <div class="person-card b">
              <div class="person-header">
                <span class="person-name">${partnerBName}</span>
                <span class="person-ratio-tag">${defaultRatioB}%</span>
              </div>
              <div class="person-paid-val">¥${activeCalc.totalPaidB.toLocaleString()}</div>
              <div class="person-goal-val">目安: ¥${activeCalc.totalOwedB.toLocaleString()}</div>
              <div class="person-diff-val ${activeCalc.balanceB >= 0 ? 'plus' : 'minus'}">
                ${activeCalc.balanceB >= 0 ? `+¥${activeCalc.balanceB.toLocaleString()} (立替)` : `-¥${Math.abs(activeCalc.balanceB).toLocaleString()} (不足)`}
              </div>
            </div>
          </div>

          <!-- アクションボタン -->
          <div class="settlement-actions">
            <button class="btn-primary" id="btnShareLine">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 5.92 2 10.75c0 3.12 1.88 5.86 4.71 7.35-.21.75-.76 2.73-.87 3.14-.14.5.18.5.38.36.16-.11 2.5-1.7 3.51-2.39.73.13 1.49.2 2.27.2 5.52 0 10-3.92 10-8.75S17.52 2 12 2z"/>
              </svg>
              <span>LINEでお知らせ</span>
            </button>
            <button class="btn-secondary ${isSettled ? 'btn-settled-locked' : ''}" id="btnSettleDone" title="${isSettled ? 'クリックして精算ロックを解除' : '精算を完了して今月をロック'}">
              <span>${isSettled ? '🔒 精算済み（ロック解除）' : '精算完了 🎉'}</span>
            </button>
          </div>
        </section>

        <!-- 統計サマリー -->
        <section class="stats-row">
          <div class="stat-box">
            <div class="stat-box-title">総支出</div>
            <div class="stat-box-num">¥${calc.totalAmount.toLocaleString()}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-title">固定費</div>
            <div class="stat-box-num">¥${calc.fixedAmount.toLocaleString()}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-title">変動費</div>
            <div class="stat-box-num">¥${calc.variableAmount.toLocaleString()}</div>
          </div>
        </section>

        <!-- タブ -->
        <nav class="mochi-tabs">
          <button class="mochi-tab ${this.activeTab === 'all' ? 'active' : ''}" data-tab="all">
            <span>すべて</span>
            <span class="badge">${calc.itemCount}</span>
          </button>
          <button class="mochi-tab ${this.activeTab === 'variable' ? 'active' : ''}" data-tab="variable">
            <span>変動費</span>
          </button>
          <button class="mochi-tab ${this.activeTab === 'fixed' ? 'active' : ''}" data-tab="fixed">
            <span>固定費</span>
            <span class="badge">${calc.activeFixedCount}</span>
          </button>
          <button class="mochi-tab ${this.activeTab === 'charts' ? 'active' : ''}" data-tab="charts">
            <span>内訳</span>
          </button>
        </nav>

        ${this.activeTab === 'fixed' ? `
          <div class="fixed-cost-intro-banner">
            <div>
              <div style="font-weight: 900; font-size: 0.95rem;">今月の固定費（${this.formatMonthDisplay(this.currentMonth)}）</div>
              <div style="font-size: 0.78rem; color: var(--mochi-ink-sub);">登録した月以降のみ自動で反映されます</div>
            </div>
            <button class="btn-secondary" id="btnAddFixedCost" style="padding: 8px 14px; font-size: 0.85rem;">
              + 固定費を追加
            </button>
          </div>
        ` : ''}

        ${this.activeTab === 'charts' ? `
          <section class="mochi-card" style="padding: 20px;">
            <div style="font-weight: 900; font-size: 1.05rem; margin-bottom: 16px;">
              📊 ${this.formatMonthDisplay(this.currentMonth)} カテゴリ別
            </div>
            ${Object.keys(calc.categoryTotals).length === 0 ? `
              <div class="empty-mochi-box">
                ${renderMochiDog('calm', 90)}
                <div style="font-size: 0.9rem; font-weight: 700; color: var(--mochi-ink-sub);">データがまだありませんよ</div>
              </div>
            ` : Object.entries(calc.categoryTotals)
                .sort((a, b) => b[1] - a[1])
                .map(([catKey, amount]) => {
                  const cat = CATEGORIES[catKey] || CATEGORIES.other;
                  const percent = Math.round((amount / (calc.totalAmount || 1)) * 100);
                  return `
                    <div style="margin-bottom: 14px;">
                      <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 0.85rem; margin-bottom: 4px;">
                        <span>${cat.icon} ${cat.name}</span>
                        <span>¥${amount.toLocaleString()} (${percent}%)</span>
                      </div>
                      <div style="height: 12px; background: var(--mochi-kinako); border: 2px solid var(--mochi-ink); border-radius: var(--radius-full); overflow: hidden;">
                        <div style="height: 100%; width: ${percent}%; background: var(--mochi-yaki); border-radius: var(--radius-full);"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
          </section>
        ` : `
          <div class="list-header-actions">
            <div style="font-weight: 800; font-size: 0.9rem; display: flex; align-items: center; gap: 6px;">
              <span>📋 支出・固定費一覧</span>
              <span class="badge" style="font-size: 0.72rem; background: var(--mochi-kinako); padding: 2px 6px; border-radius: 999px; border: 1px solid var(--mochi-ink);">${displayedItems.length}件</span>
            </div>
            ${displayedItems.length > 0 ? `
              <button type="button" class="btn-secondary btn-select-mode" id="btnToggleSelectMode">
                ${this.isSelectMode ? '✕ 選択終了' : '☑️ 選択して削除'}
              </button>
            ` : ''}
          </div>

          ${this.isSelectMode ? `
            <div class="bulk-action-bar">
              <div style="display: flex; align-items: center; gap: 8px;">
                <button type="button" class="btn-secondary" id="btnSelectAll" style="padding: 4px 10px; font-size: 0.78rem;">
                  ${this.selectedIds.size === displayedItems.length ? '全解除' : '全選択'}
                </button>
                <span style="font-weight: 800; font-size: 0.82rem; color: var(--mochi-ink);">
                  ${this.selectedIds.size}件 選択中
                </span>
              </div>
              <button type="button" class="btn-primary" id="btnBulkDelete" ${this.selectedIds.size === 0 ? 'disabled' : ''} style="padding: 6px 12px; font-size: 0.8rem; background: #EF4444; color: #FFF; border-color: var(--mochi-ink); box-shadow: 0 2px 0 var(--mochi-ink);">
                🗑️ 選択した項目を削除
              </button>
            </div>
          ` : ''}

          <div class="category-filter-bar">
            <button class="mochi-chip ${this.selectedCategoryFilter === 'all' ? 'active' : ''}" data-cat="all">すべて</button>
            ${Object.entries(CATEGORIES).map(([key, cat]) => `
              <button class="mochi-chip ${this.selectedCategoryFilter === key ? 'active' : ''}" data-cat="${key}">
                ${cat.icon} ${cat.name}
              </button>
            `).join('')}
          </div>

          <section class="expense-items-list">
            ${displayedItems.length === 0 ? `
              <div class="empty-mochi-box">
                ${renderMochiDog('calm', 100)}
                ${renderCaption('データはまだないです')}
                <div style="font-size: 0.85rem; color: var(--mochi-ink-sub); margin-top: 6px;">
                  右下の「＋ 記録する」からのんびり登録してくださいね
                </div>
              </div>
            ` : displayedItems.map(item => {
              const cat = CATEGORIES[item.category] || CATEGORIES.other;
              const isPayerA = item.paidBy === 'A';
              const payerName = isPayerA ? partnerAName : partnerBName;
              const isChecked = this.selectedIds.has(item.id);

              let splitText = '比率通り';
              if (item.splitType === 'half') splitText = '折半';
              if (item.splitType === 'fullA') splitText = `${partnerAName}全額`;
              if (item.splitType === 'fullB') splitText = `${partnerBName}全額`;
              if (item.splitType === 'custom') splitText = `カスタム (${item.customRatioA}%)`;

              return `
                <div class="expense-card-item ${this.isSelectMode ? 'selection-mode' : ''} ${isChecked ? 'selected' : ''}" data-id="${item.id}" data-is-fixed="${item.isFixed}">
                  ${this.isSelectMode ? `
                    <div class="item-checkbox-wrapper">
                      <input type="checkbox" class="item-checkbox" data-id="${item.id}" ${isChecked ? 'checked' : ''} />
                    </div>
                  ` : ''}
                  <div class="expense-card-left">
                    <div class="item-cat-icon">
                      <span>${cat.icon}</span>
                    </div>
                    <div class="item-info">
                      <div class="item-title-line">
                        <span class="item-title">${item.title}</span>
                        ${item.isFixed ? `<span class="partner-pill" style="font-size: 0.65rem; padding: 1px 6px;">固定費</span>` : ''}
                      </div>
                      <div class="item-sub-line">
                        <span>${item.date.slice(5)}</span>
                        <span>•</span>
                        <span class="payer-badge-pill ${isPayerA ? 'a' : 'b'}">${payerName}</span>
                        <span>•</span>
                        <span>${splitText}</span>
                      </div>
                    </div>
                  </div>
                  <div class="item-amount-val">
                    ¥${item.amount.toLocaleString()}
                  </div>
                </div>
              `;
            }).join('')}
          </section>
        `}
      </main>

      <button class="mochi-fab" id="btnOpenExpenseModal">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>記録する</span>
      </button>

      <div id="toastNotification" class="toast"></div>
      <div id="modalContainer"></div>
    `;
  }

  // 月別推移・一覧画面のコンテンツ生成
  renderTrendsContent() {
    const { partnerAName, partnerBName } = this.settings;

    // 1. 記録されている全年月を収集
    const monthSet = new Set();
    this.expenses.forEach(e => {
      if (e.date && e.date.length >= 7) {
        monthSet.add(e.date.substring(0, 7));
      }
    });
    this.fixedCosts.forEach(f => {
      if (f.startMonth) monthSet.add(f.startMonth);
    });
    monthSet.add(this.currentMonth);
    monthSet.add(getCurrentMonthString());

    let sortedMonths = Array.from(monthSet).sort();
    // 最低6ヶ月分になるよう補完
    while (sortedMonths.length < 6) {
      const earliest = sortedMonths[0];
      const [y, m] = earliest.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      sortedMonths.unshift(prevMonthStr);
    }
    // 最大12ヶ月に収める
    if (sortedMonths.length > 12) {
      sortedMonths = sortedMonths.slice(sortedMonths.length - 12);
    }

    const trendsData = sortedMonths.map(month => {
      const calc = calculateSettlement({
        expenses: this.expenses,
        fixedCosts: this.fixedCosts,
        settings: this.settings,
        currentMonth: month
      });
      const isSettled = this.storage.isMonthSettled(month);
      const [y, m] = month.split('-');
      return {
        month,
        monthDisplay: `${y}年${parseInt(m, 10)}月`,
        shortLabel: `${parseInt(m, 10)}月`,
        isSettled,
        ...calc
      };
    });

    const allTotal = trendsData.reduce((sum, d) => sum + d.totalAmount, 0);
    const avgPerMonth = Math.round(allTotal / (trendsData.length || 1));
    const allPaidA = trendsData.reduce((sum, d) => sum + d.totalPaidA, 0);
    const allPaidB = trendsData.reduce((sum, d) => sum + d.totalPaidB, 0);
    const settledCount = trendsData.filter(d => d.isSettled).length;

    // SVG 積み上げ棒グラフの作成
    const svgWidth = 580;
    const svgHeight = 220;
    const paddingLeft = 46;
    const paddingRight = 16;
    const paddingTop = 32;
    const paddingBottom = 42;
    const chartHeight = svgHeight - paddingTop - paddingBottom;
    const chartWidth = svgWidth - paddingLeft - paddingRight;

    const rawMax = Math.max(...trendsData.map(d => d.totalAmount), 30000);
    const maxAmount = Math.ceil(rawMax / 50000) * 50000 || 50000;

    const colWidth = chartWidth / trendsData.length;
    const barWidth = Math.min(32, colWidth * 0.58);

    const yTicks = [0, maxAmount / 2, maxAmount];

    const barsSvg = trendsData.map((d, i) => {
      const centerX = paddingLeft + (i + 0.5) * colWidth;
      const barX = centerX - barWidth / 2;
      const varH = maxAmount > 0 ? (d.variableAmount / maxAmount) * chartHeight : 0;
      const fixedH = maxAmount > 0 ? (d.fixedAmount / maxAmount) * chartHeight : 0;
      const totalH = varH + fixedH;
      const yBase = paddingTop + chartHeight;

      const varY = yBase - varH;
      const fixedY = yBase - totalH;

      const amountK = d.totalAmount >= 10000
        ? `¥${(d.totalAmount / 10000).toFixed(1)}万`
        : `¥${d.totalAmount.toLocaleString()}`;

      const isCurrent = d.month === this.currentMonth;

      return `
        <g class="chart-col-group" data-month="${d.month}" style="cursor: pointer;">
          <!-- ホバー・現在月背景 -->
          <rect x="${centerX - colWidth / 2 + 2}" y="${paddingTop}" width="${colWidth - 4}" height="${chartHeight}" fill="${isCurrent ? 'rgba(242, 179, 76, 0.12)' : 'transparent'}" rx="6" />

          <!-- 変動費バー (アンバー) -->
          ${varH > 0 ? `
            <rect x="${barX}" y="${varY}" width="${barWidth}" height="${varH}" fill="var(--mochi-yaki)" rx="3" />
          ` : ''}

          <!-- 固定費バー (紫) -->
          ${fixedH > 0 ? `
            <rect x="${barX}" y="${fixedY}" width="${barWidth}" height="${fixedH}" fill="#8B5CF6" rx="3" />
          ` : ''}

          <!-- 金額ラベル -->
          ${d.totalAmount > 0 ? `
            <text x="${centerX}" y="${fixedY - 6}" font-size="10" font-weight="800" fill="var(--mochi-ink)" text-anchor="middle" font-family="var(--font-base)">${amountK}</text>
          ` : `
            <text x="${centerX}" y="${yBase - 6}" font-size="9" fill="var(--mochi-ink-sub)" text-anchor="middle" font-family="var(--font-base)">¥0</text>
          `}

          <!-- 月ラベル -->
          <text x="${centerX}" y="${yBase + 16}" font-size="11" font-weight="${isCurrent ? '900' : '700'}" fill="${isCurrent ? 'var(--mochi-ink)' : 'var(--mochi-ink-sub)'}" text-anchor="middle" font-family="var(--font-base)">${d.shortLabel}</text>

          <!-- ロックアイコンまたは状態 -->
          <text x="${centerX}" y="${yBase + 32}" font-size="10" text-anchor="middle">${d.isSettled ? '🔒' : '⚡'}</text>
        </g>
      `;
    }).join('');

    const gridSvg = yTicks.map(val => {
      const yPos = paddingTop + chartHeight - (val / maxAmount) * chartHeight;
      const label = val >= 10000 ? `${val / 10000}万` : val;
      return `
        <line x1="${paddingLeft}" y1="${yPos}" x2="${svgWidth - paddingRight}" y2="${yPos}" stroke="rgba(0,0,0,0.06)" stroke-dasharray="3,3" />
        <text x="${paddingLeft - 6}" y="${yPos + 4}" font-size="9" fill="var(--mochi-ink-sub)" text-anchor="end" font-family="var(--font-base)">${label}</text>
      `;
    }).join('');

    const reversedList = [...trendsData].reverse();

    return `
      <main class="trends-view-container">
        <!-- 統計サマリーカード -->
        <section class="trends-hero-card">
          <div class="trends-header-row">
            <div class="trends-main-title">
              <span>📈</span>
              <span>月別推移・出費一覧</span>
            </div>
            <div class="trends-badge">
              集計月数: ${trendsData.length}ヶ月（精算済: ${settledCount}ヶ月）
            </div>
          </div>
          <div class="trends-subtitle">
            月ごとの生活費と2人の立替負担を一覧で振り返ることができます
          </div>

          <div class="trends-kpi-grid">
            <div class="trends-kpi-box">
              <div class="trends-kpi-label">全期間 総支出</div>
              <div class="trends-kpi-value" style="color: var(--mochi-ink);">¥${allTotal.toLocaleString()}</div>
            </div>
            <div class="trends-kpi-box">
              <div class="trends-kpi-label">月平均 支出</div>
              <div class="trends-kpi-value" style="color: var(--mochi-konga);">¥${avgPerMonth.toLocaleString()}</div>
            </div>
            <div class="trends-kpi-box">
              <div class="trends-kpi-label">${partnerAName} 累計支払</div>
              <div class="trends-kpi-value" style="color: #2563EB;">¥${allPaidA.toLocaleString()}</div>
            </div>
            <div class="trends-kpi-box">
              <div class="trends-kpi-label">${partnerBName} 累計支払</div>
              <div class="trends-kpi-value" style="color: #DB2777;">¥${allPaidB.toLocaleString()}</div>
            </div>
          </div>
        </section>

        <!-- 月別推移グラフカード -->
        <section class="trends-chart-card">
          <div class="chart-header">
            <div class="chart-title">📊 支出の月別推移（積み上げ）</div>
            <div class="chart-legend">
              <div class="legend-item"><span class="legend-dot variable"></span><span>変動費</span></div>
              <div class="legend-item"><span class="legend-dot fixed"></span><span>固定費</span></div>
              <div class="legend-item"><span class="legend-dot settled"></span><span>🔒 精算済</span></div>
            </div>
          </div>

          <div class="trends-svg-container">
            <svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width: 100%; min-width: 480px; height: auto; display: block;">
              ${gridSvg}
              ${barsSvg}
            </svg>
          </div>
          <div style="font-size: 0.74rem; color: var(--mochi-ink-sub); text-align: center; margin-top: 6px;">
            💡 棒グラフをタップすると、その月の個別精算画面にジャンプします
          </div>
        </section>

        <!-- 月別詳細カード一覧（新しい月順） -->
        <section class="trends-months-list">
          <div style="font-weight: 900; font-size: 1.05rem; margin-bottom: 4px; padding-left: 2px;">
            🗓️ 月別の出費・精算一覧
          </div>

          ${reversedList.map(item => `
            <div class="trends-month-card">
              <div class="trends-month-card-header">
                <div class="month-badge-group">
                  <span class="trends-month-name">${item.monthDisplay}</span>
                  ${item.isSettled ? `
                    <span class="status-pill settled">🔒 精算完了</span>
                  ` : `
                    <span class="status-pill active">⚡ 進行中</span>
                  `}
                </div>
                <button type="button" class="btn-secondary btn-jump-month" data-month="${item.month}" style="padding: 5px 12px; font-size: 0.76rem;">
                  この月を開く ➔
                </button>
              </div>

              <div class="trends-month-metrics">
                <div class="month-metric-box">
                  <div class="month-metric-label">総支出</div>
                  <div class="month-metric-val">¥${item.totalAmount.toLocaleString()}</div>
                </div>
                <div class="month-metric-box">
                  <div class="month-metric-label">固定費</div>
                  <div class="month-metric-val">¥${item.fixedAmount.toLocaleString()}</div>
                </div>
                <div class="month-metric-box">
                  <div class="month-metric-label">変動費</div>
                  <div class="month-metric-val">¥${item.variableAmount.toLocaleString()}</div>
                </div>
              </div>

              <div class="trends-month-partners">
                <span>🐾 ${partnerAName}: ¥${item.totalPaidA.toLocaleString()}</span>
                <span>🐾 ${partnerBName}: ¥${item.totalPaidB.toLocaleString()}</span>
              </div>

              <div class="trends-settlement-result">
                ${item.status === 'even' ? `
                  <span style="color: var(--mochi-ink);">⚖️ 精算はぴったりです</span>
                  <span style="font-size: 0.8rem; color: var(--mochi-ink-sub);">イーブン</span>
                ` : `
                  <span style="color: var(--mochi-ink);">👉 <strong>${item.payerName}</strong> から <strong>${item.receiverName}</strong> へ</span>
                  <span style="font-size: 1.05rem; font-weight: 900; color: var(--mochi-konga);">¥${item.transferAmount.toLocaleString()}</span>
                `}
              </div>
            </div>
          `).join('')}
        </section>
      </main>

      <button class="mochi-fab" id="btnOpenExpenseModal">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>記録する</span>
      </button>

      <div id="toastNotification" class="toast"></div>
      <div id="modalContainer"></div>
    `;
  }

  attachEventListeners() {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    appEl.querySelector('#btnOpenSync')?.addEventListener('click', () => this.openSyncModal());
    appEl.querySelector('#btnOpenSettings')?.addEventListener('click', () => this.openSettingsModal());
    appEl.querySelector('#btnLogo')?.addEventListener('click', () => this.openSettingsModal());

    // ビュー切替トグル（月の精算 vs 月別推移・一覧）
    appEl.querySelector('#btnViewMonthly')?.addEventListener('click', () => {
      if (this.viewMode !== 'monthly') {
        this.viewMode = 'monthly';
        this.render();
        this.attachEventListeners();
      }
    });

    appEl.querySelector('#btnViewTrends')?.addEventListener('click', () => {
      if (this.viewMode !== 'trends') {
        this.viewMode = 'trends';
        this.render();
        this.attachEventListeners();
      }
    });

    // 月別推移画面からの月ジャンプ
    appEl.querySelectorAll('.btn-jump-month, .chart-col-group').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const m = e.currentTarget.dataset.month;
        if (m) {
          this.currentMonth = m;
          this.viewMode = 'monthly';
          this.render();
          this.attachEventListeners();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          this.showToast(`${this.formatMonthDisplay(m)}の精算を表示しました 📅`);
        }
      });
    });

    appEl.querySelector('#btnPrevMonth')?.addEventListener('click', () => this.changeMonth(-1));
    appEl.querySelector('#btnNextMonth')?.addEventListener('click', () => this.changeMonth(1));
    
    // 【フィードバック1】現在の月に戻るボタンのクリックイベント
    appEl.querySelector('#btnReturnToCurrentMonth')?.addEventListener('click', () => {
      this.currentMonth = getCurrentMonthString();
      this.render();
      this.attachEventListeners();
      this.showToast('今月に戻りましたよ 📅');
    });

    appEl.querySelectorAll('.mochi-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.activeTab = e.currentTarget.dataset.tab;
        this.render();
        this.attachEventListeners();
      });
    });

    appEl.querySelectorAll('.mochi-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        this.selectedCategoryFilter = e.currentTarget.dataset.cat;
        this.render();
        this.attachEventListeners();
      });
    });

    // シーソー集計範囲切替（変動費のみ vs すべて含む）
    appEl.querySelectorAll('.seesaw-scope-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.seesawScope = e.currentTarget.dataset.scope;
        this.render();
        this.attachEventListeners();
      });
    });

    // 複数選択モード切替
    appEl.querySelector('#btnToggleSelectMode')?.addEventListener('click', () => {
      if (this.storage.isMonthSettled(this.currentMonth)) {
        this.showToast(`🔒 ${this.formatMonthDisplay(this.currentMonth)}は精算完了済みのため削除できません`);
        return;
      }
      this.isSelectMode = !this.isSelectMode;
      if (!this.isSelectMode) {
        this.selectedIds.clear();
      }
      this.render();
      this.attachEventListeners();
    });

    // 全選択 / 全解除
    appEl.querySelector('#btnSelectAll')?.addEventListener('click', () => {
      const calc = calculateSettlement({
        expenses: this.expenses,
        fixedCosts: this.fixedCosts,
        settings: this.settings,
        currentMonth: this.currentMonth
      });
      let displayedItems = calc.allItems;
      if (this.activeTab === 'variable') displayedItems = displayedItems.filter(i => !i.isFixed);
      else if (this.activeTab === 'fixed') displayedItems = displayedItems.filter(i => i.isFixed);
      if (this.selectedCategoryFilter !== 'all') displayedItems = displayedItems.filter(i => i.category === this.selectedCategoryFilter);

      if (this.selectedIds.size === displayedItems.length) {
        this.selectedIds.clear();
      } else {
        displayedItems.forEach(i => this.selectedIds.add(i.id));
      }
      this.render();
      this.attachEventListeners();
    });

    // 複数選択一括削除
    appEl.querySelector('#btnBulkDelete')?.addEventListener('click', async () => {
      if (this.storage.isMonthSettled(this.currentMonth)) {
        this.showToast(`🔒 ${this.formatMonthDisplay(this.currentMonth)}は精算完了済みのため削除できません`);
        return;
      }

      const count = this.selectedIds.size;
      if (count === 0) return;
      if (!confirm(`選択した ${count} 件の項目を削除しますか？\n（固定費が含まれる場合は今月以降が削除されます）`)) {
        return;
      }

      for (const id of this.selectedIds) {
        if (id.startsWith('fixed_')) {
          const fixedId = id.replace('fixed_', '');
          await this.storage.deleteFixedCost(fixedId, this.currentMonth);
        } else {
          await this.storage.deleteExpense(id);
        }
      }

      this.selectedIds.clear();
      this.isSelectMode = false;
      await this.loadData();
      this.render();
      this.attachEventListeners();
      this.showToast(`${count}件をまとめて削除しましたよ 🗑️`);
    });

    appEl.querySelector('#btnOpenExpenseModal')?.addEventListener('click', () => {
      if (this.storage.isMonthSettled(this.currentMonth)) {
        this.showToast(`🔒 ${this.formatMonthDisplay(this.currentMonth)}は精算済みのため記録できません。ロック解除してからお試しください。`);
        return;
      }
      this.openExpenseModal(null, 'variable');
    });

    appEl.querySelector('#btnAddFixedCost')?.addEventListener('click', () => {
      if (this.storage.isMonthSettled(this.currentMonth)) {
        this.showToast(`🔒 ${this.formatMonthDisplay(this.currentMonth)}は精算済みのため固定費を追加できません。`);
        return;
      }
      this.openExpenseModal(null, 'fixed');
    });

    appEl.querySelector('#btnShareLine')?.addEventListener('click', () => {
      this.handleShareLine();
    });

    // 精算完了 / ロック解除ボタン
    appEl.querySelector('#btnSettleDone')?.addEventListener('click', () => {
      this.openSettlementModal();
    });

    appEl.querySelectorAll('.expense-card-item').forEach(itemEl => {
      const id = itemEl.dataset.id;
      const isFixed = itemEl.dataset.isFixed === 'true';

      itemEl.addEventListener('click', (e) => {
        if (this.storage.isMonthSettled(this.currentMonth)) {
          this.showToast(`🔒 ${this.formatMonthDisplay(this.currentMonth)}は精算完了済みのため編集・削除できません`);
          return;
        }

        // 複数選択モードの場合：選択のON/OFFを切り替える
        if (this.isSelectMode) {
          if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
          } else {
            this.selectedIds.add(id);
          }
          this.render();
          this.attachEventListeners();
          return;
        }

        // 通常モードの場合：編集モーダルを開く
        if (isFixed) {
          const realId = id.replace('fixed_', '');
          const target = this.fixedCosts.find(f => String(f.id) === String(realId));
          if (target) this.openExpenseModal(target, 'fixed');
        } else {
          const target = this.expenses.find(x => String(x.id) === String(id));
          if (target) this.openExpenseModal(target, 'variable');
        }
      });
    });
  }

  // 精算完了・ロック確認モーダル（キュートなもちもち犬デザイン）
  openSettlementModal() {
    const isSettled = this.storage.isMonthSettled(this.currentMonth);
    const monthLabel = this.formatMonthDisplay(this.currentMonth);
    const modalContainer = document.getElementById('modalContainer');

    modalContainer.innerHTML = `
      <div class="modal-overlay open" id="settleConfirmOverlay">
        <div class="modal-dialog" style="max-width: 420px; text-align: center; border-radius: 24px; padding: 24px;">
          <div class="modal-header" style="border-bottom: none; padding: 0 0 8px; justify-content: flex-end;">
            <button class="icon-btn" id="btnCloseSettleModal">✕</button>
          </div>
          <div class="modal-body" style="padding: 0 8px 12px;">
            <img src="/characters/${isSettled ? 'mochi-calm.png' : 'mochi-smile.png'}" 
                 alt="もちもち犬" 
                 style="width: 88px; height: 88px; object-fit: contain; margin: 0 auto 12px; display: block;" />
            <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--mochi-ink); margin-bottom: 8px;">
              ${isSettled ? `${monthLabel}の精算ロックを解除しますか？` : `${monthLabel}の精算を完了しますか？`}
            </h3>
            <p style="font-size: 0.88rem; color: var(--mochi-ink-light); line-height: 1.6; margin-bottom: 20px;">
              ${isSettled 
                ? 'ロックを解除すると、項目の追加・編集・削除が再びできるようになります。'
                : '今月の精算額が固定され、項目の追加・編集・削除がロックされます。<br><span style="font-size: 0.78rem; opacity: 0.85;">※後からいつでもワンタップでロック解除できます</span>'
              }
            </p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <button class="btn-primary" id="btnConfirmSettleAction" style="width: 100%; justify-content: center; padding: 12px;">
                <span>${isSettled ? '🔓 ロックを解除する' : '🔒 精算を完了して固定する'}</span>
              </button>
              <button class="btn-secondary" id="btnCancelSettleAction" style="width: 100%; justify-content: center; padding: 10px;">
                <span>キャンセル</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const overlay = document.getElementById('settleConfirmOverlay');
    const close = () => {
      overlay.classList.remove('open');
      setTimeout(() => { modalContainer.innerHTML = ''; }, 200);
    };

    document.getElementById('btnCloseSettleModal')?.addEventListener('click', close);
    document.getElementById('btnCancelSettleAction')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    document.getElementById('btnConfirmSettleAction')?.addEventListener('click', async () => {
      close();
      if (isSettled) {
        await this.storage.setMonthSettled(this.currentMonth, false);
        this.showToast(`${monthLabel}のロックを解除しましたよ 🔓`);
        this.render();
        this.attachEventListeners();
      } else {
        await this.storage.setMonthSettled(this.currentMonth, true);
        this.handleSettleCelebration();
        this.render();
        this.attachEventListeners();
        this.showToast(`${monthLabel}の精算を完了・固定しましたよ 🔒✨`);
      }
    });
  }

  // 支出・固定費の記録モーダル（変動費/固定費切替対応）
  openExpenseModal(itemToEdit = null, defaultType = 'variable') {
    const isEdit = !!itemToEdit;
    const { partnerAName, partnerBName, defaultRatioA } = this.settings;

    let initialCostType = defaultType || 'variable';
    let editId = '';
    let originalType = '';

    if (itemToEdit) {
      editId = itemToEdit.fixedCostId || (itemToEdit.id ? String(itemToEdit.id).replace('fixed_', '') : '');
      const isFixedItem = Boolean(itemToEdit.startMonth || itemToEdit.isFixed || defaultType === 'fixed');
      initialCostType = isFixedItem ? 'fixed' : 'variable';
      originalType = initialCostType;
    }

    const initialPaidBy = itemToEdit ? itemToEdit.paidBy : 'A';
    const initialCategory = itemToEdit ? itemToEdit.category : (initialCostType === 'fixed' ? 'housing' : 'food');
    const initialSplitType = itemToEdit ? itemToEdit.splitType : 'default';
    const initialCustomRatioA = itemToEdit?.customRatioA != null ? itemToEdit.customRatioA : defaultRatioA;
    const initialDate = itemToEdit?.date || getTodayString();
    const initialStartMonth = itemToEdit?.startMonth || this.currentMonth;

    const modalContainer = document.getElementById('modalContainer');
    modalContainer.innerHTML = `
      <div class="modal-overlay open" id="expenseModalOverlay">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title" id="modalHeadingTitle">${isEdit ? (initialCostType === 'fixed' ? '固定費を直す' : '支出を直す') : (initialCostType === 'fixed' ? '固定費を記録する' : '支出を記録する')}</h3>
            <button class="icon-btn" id="btnCloseExpenseModal">✕</button>
          </div>
          <form id="expenseForm" class="modal-body">
            <!-- 編集対象のIDと元の種別を確実に保持 -->
            <input type="hidden" id="formEditId" value="${editId}" />
            <input type="hidden" id="formOriginalType" value="${originalType}" />

            <!-- 変動費・固定費の選択トグル（デフォルトは変動費） -->
            <div class="form-group">
              <label class="form-label">支出の種類</label>
              <div class="cost-type-toggle">
                <button type="button" class="cost-type-btn ${initialCostType === 'variable' ? 'active' : ''}" id="btnCostTypeVariable">
                  <span style="font-size: 0.95rem; font-weight: 800;">⚡ 変動費</span>
                  <span style="font-size: 0.72rem; opacity: 0.85;">今月のお買い物・外食など</span>
                </button>
                <button type="button" class="cost-type-btn ${initialCostType === 'fixed' ? 'active' : ''}" id="btnCostTypeFixed">
                  <span style="font-size: 0.95rem; font-weight: 800;">🔄 固定費</span>
                  <span style="font-size: 0.72rem; opacity: 0.85;">毎月自動（家賃・光熱費等）</span>
                </button>
              </div>
              <input type="hidden" id="formCostType" value="${initialCostType}" />
            </div>

            <!-- 固定費の説明案内 -->
            <div id="fixedCostNotice" style="display: ${initialCostType === 'fixed' ? 'block' : 'none'}; font-size: 0.78rem; background: var(--mochi-kinako); border: 1.5px solid var(--mochi-ink); border-radius: var(--radius-sm); padding: 8px 12px; margin-bottom: 12px; color: var(--mochi-ink); line-height: 1.5;">
              🐾 <strong>毎月の固定費</strong><br />
              家賃や光熱費・サブスクなど、指定した開始月以降に毎月自動反映されます。
            </div>

            <div class="form-group">
              <label class="form-label" id="labelPayerQuestion">${initialCostType === 'fixed' ? '引落口座・カード担当' : 'どちらが支払いましたか？'}</label>
              <div class="payer-toggle-group">
                <button type="button" class="payer-toggle-btn a ${initialPaidBy === 'A' ? 'selected' : ''}" id="btnPayerA">
                  <div style="font-weight: 900; font-size: 1rem;">${partnerAName}</div>
                  <div style="font-size: 0.75rem;" id="payerSubA">${initialCostType === 'fixed' ? 'の口座/カード' : 'が立替えた'}</div>
                </button>
                <button type="button" class="payer-toggle-btn b ${initialPaidBy === 'B' ? 'selected' : ''}" id="btnPayerB">
                  <div style="font-weight: 900; font-size: 1rem;">${partnerBName}</div>
                  <div style="font-size: 0.75rem;" id="payerSubB">${initialCostType === 'fixed' ? 'の口座/カード' : 'が立替えた'}</div>
                </button>
              </div>
              <input type="hidden" id="formPaidBy" value="${initialPaidBy}" />
            </div>

            <div class="form-group">
              <label class="form-label" id="labelAmount">${initialCostType === 'fixed' ? '月額料金 (円)' : '金額 (円)'}</label>
              <input type="number" id="formAmount" class="form-input" placeholder="${initialCostType === 'fixed' ? '例: 96000' : '例: 3500'}" style="font-size: 1.4rem;" value="${itemToEdit ? itemToEdit.amount : ''}" required autofocus />
            </div>

            <div class="form-group">
              <label class="form-label" id="labelTitle">${initialCostType === 'fixed' ? '固定費の項目名' : '使った内容'}</label>
              <input type="text" id="formTitle" class="form-input" placeholder="${initialCostType === 'fixed' ? '例: 家賃、光回線、水道光熱費' : '例: スーパーで食材まとめ買い'}" value="${itemToEdit ? itemToEdit.title : ''}" required />
            </div>

            <div class="form-group">
              <label class="form-label">カテゴリ</label>
              <div class="category-grid">
                ${Object.entries(CATEGORIES).map(([key, cat]) => `
                  <button type="button" class="category-option-btn ${initialCategory === key ? 'selected' : ''}" data-cat="${key}">
                    <span style="font-size: 1.3rem;">${cat.icon}</span>
                    <span style="font-size: 0.72rem; font-weight: 700;">${cat.name}</span>
                  </button>
                `).join('')}
              </div>
              <input type="hidden" id="formCategory" value="${initialCategory}" />
            </div>

            <div class="form-row">
              <!-- 変動費：日付 -->
              <div class="form-group" id="groupVariableDate" style="display: ${initialCostType === 'variable' ? 'block' : 'none'};">
                <label class="form-label">日付</label>
                <input type="date" id="formDate" class="form-input" value="${initialDate}" />
              </div>

              <!-- 固定費：開始月 -->
              <div class="form-group" id="groupFixedStartMonth" style="display: ${initialCostType === 'fixed' ? 'block' : 'none'};">
                <label class="form-label">反映開始月</label>
                <input type="month" id="formFixedStartMonth" class="form-input" value="${initialStartMonth}" />
              </div>

              <!-- 負担ルール -->
              <div class="form-group">
                <label class="form-label">負担ルール</label>
                <select id="formSplitType" class="form-select">
                  <option value="default" ${initialSplitType === 'default' ? 'selected' : ''}>基本比率 (${defaultRatioA}:${100 - defaultRatioA})</option>
                  <option value="half" ${initialSplitType === 'half' ? 'selected' : ''}>折半 (50:50)</option>
                  <option value="fullA" ${initialSplitType === 'fullA' ? 'selected' : ''}>全額 ${partnerAName}</option>
                  <option value="fullB" ${initialSplitType === 'fullB' ? 'selected' : ''}>全額 ${partnerBName}</option>
                  <option value="custom" ${initialSplitType === 'custom' ? 'selected' : ''}>カスタム比率</option>
                </select>
              </div>
            </div>

            <div id="customRatioWrapper" class="ratio-slider-container" style="display: ${initialSplitType === 'custom' ? 'block' : 'none'};">
              <div class="ratio-display-row">
                <span>${partnerAName}: <span id="customRatioValA">${initialCustomRatioA}</span>%</span>
                <span>${partnerBName}: <span id="customRatioValB">${100 - initialCustomRatioA}</span>%</span>
              </div>
              <input type="range" id="customRatioSlider" class="custom-range-slider" min="0" max="100" step="5" value="${initialCustomRatioA}" />
            </div>
          </form>

          <div class="modal-footer">
            ${isEdit ? `
              <button type="button" class="btn-secondary" id="btnDeleteExpense" style="color: #DC2626;">
                ${initialCostType === 'fixed' ? '今月以降を削除' : '削除する'}
              </button>
            ` : ''}
            <button type="button" class="btn-secondary" id="btnCancelExpense">やめる</button>
            <button type="submit" form="expenseForm" class="btn-primary">${isEdit ? '更新する' : '記録する'}</button>
          </div>
        </div>
      </div>
    `;

    const overlay = document.getElementById('expenseModalOverlay');
    const close = () => { overlay.classList.remove('open'); modalContainer.innerHTML = ''; };

    overlay.querySelector('#btnCloseExpenseModal').addEventListener('click', close);
    overlay.querySelector('#btnCancelExpense').addEventListener('click', close);

    const btnCostTypeVariable = overlay.querySelector('#btnCostTypeVariable');
    const btnCostTypeFixed = overlay.querySelector('#btnCostTypeFixed');
    const formCostType = overlay.querySelector('#formCostType');
    const fixedNotice = overlay.querySelector('#fixedCostNotice');
    const groupVariableDate = overlay.querySelector('#groupVariableDate');
    const groupFixedStartMonth = overlay.querySelector('#groupFixedStartMonth');
    const modalHeadingTitle = overlay.querySelector('#modalHeadingTitle');
    const labelPayerQuestion = overlay.querySelector('#labelPayerQuestion');
    const payerSubA = overlay.querySelector('#payerSubA');
    const payerSubB = overlay.querySelector('#payerSubB');
    const labelAmount = overlay.querySelector('#labelAmount');
    const formAmount = overlay.querySelector('#formAmount');
    const labelTitle = overlay.querySelector('#labelTitle');
    const formTitle = overlay.querySelector('#formTitle');

    const updateCostTypeUI = (type) => {
      formCostType.value = type;
      if (type === 'variable') {
        btnCostTypeVariable.classList.add('active');
        btnCostTypeFixed.classList.remove('active');
        fixedNotice.style.display = 'none';
        groupVariableDate.style.display = 'block';
        groupFixedStartMonth.style.display = 'none';
        modalHeadingTitle.textContent = isEdit ? '支出を直す' : '支出を記録する';
        labelPayerQuestion.textContent = 'どちらが支払いましたか？';
        payerSubA.textContent = 'が立替えた';
        payerSubB.textContent = 'が立替えた';
        labelAmount.textContent = '金額 (円)';
        formAmount.placeholder = '例: 3500';
        labelTitle.textContent = '使った内容';
        formTitle.placeholder = '例: スーパーで食材まとめ買い';
      } else {
        btnCostTypeFixed.classList.add('active');
        btnCostTypeVariable.classList.remove('active');
        fixedNotice.style.display = 'block';
        groupVariableDate.style.display = 'none';
        groupFixedStartMonth.style.display = 'block';
        modalHeadingTitle.textContent = isEdit ? '固定費を直す' : '固定費を記録する';
        labelPayerQuestion.textContent = '引落口座・カード担当';
        payerSubA.textContent = 'の口座/カード';
        payerSubB.textContent = 'の口座/カード';
        labelAmount.textContent = '月額料金 (円)';
        formAmount.placeholder = '例: 96000';
        labelTitle.textContent = '固定費の項目名';
        formTitle.placeholder = '例: 家賃、光回線、水道光熱費';
      }
    };

    btnCostTypeVariable.addEventListener('click', () => updateCostTypeUI('variable'));
    btnCostTypeFixed.addEventListener('click', () => updateCostTypeUI('fixed'));

    const btnPayerA = overlay.querySelector('#btnPayerA');
    const btnPayerB = overlay.querySelector('#btnPayerB');
    const inputPaidBy = overlay.querySelector('#formPaidBy');

    btnPayerA.addEventListener('click', () => {
      btnPayerA.classList.add('selected');
      btnPayerB.classList.remove('selected');
      inputPaidBy.value = 'A';
    });
    btnPayerB.addEventListener('click', () => {
      btnPayerB.classList.add('selected');
      btnPayerA.classList.remove('selected');
      inputPaidBy.value = 'B';
    });

    overlay.querySelectorAll('.category-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.category-option-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        overlay.querySelector('#formCategory').value = btn.dataset.cat;
      });
    });

    const splitSelect = overlay.querySelector('#formSplitType');
    const customWrapper = overlay.querySelector('#customRatioWrapper');
    const customSlider = overlay.querySelector('#customRatioSlider');
    const customValA = overlay.querySelector('#customRatioValA');
    const customValB = overlay.querySelector('#customRatioValB');

    splitSelect.addEventListener('change', () => {
      customWrapper.style.display = splitSelect.value === 'custom' ? 'block' : 'none';
    });

    customSlider.addEventListener('input', () => {
      const v = parseInt(customSlider.value, 10);
      customValA.textContent = v;
      customValB.textContent = 100 - v;
    });

    let isSubmitting = false;
    let isDeleting = false;

    overlay.querySelector('#btnDeleteExpense')?.addEventListener('click', async () => {
      if (isDeleting) return;
      if (!editId) return;

      if (this.storage.isMonthSettled(this.currentMonth)) {
        alert(`【${this.formatMonthDisplay(this.currentMonth)}】は精算完了済みのため削除できません。ロックを解除してからお試しください。`);
        return;
      }

      const delBtn = overlay.querySelector('#btnDeleteExpense');
      if (originalType === 'fixed') {
        const msg = `この固定費を【${this.formatMonthDisplay(this.currentMonth)}以降】削除しますか？\n（過去の月の記録は残ります）`;
        if (confirm(msg)) {
          isDeleting = true;
          if (delBtn) { delBtn.disabled = true; delBtn.textContent = '削除中...'; }
          await this.storage.deleteFixedCost(editId, this.currentMonth);
          await this.loadData();
          close();
          this.render();
          this.attachEventListeners();
          this.showToast('固定費を削除しましたよ');
        }
      } else {
        if (confirm('この記録を消してもよろしいですか？')) {
          isDeleting = true;
          if (delBtn) { delBtn.disabled = true; delBtn.textContent = '削除中...'; }
          await this.storage.deleteExpense(editId);
          await this.loadData();
          close();
          this.render();
          this.attachEventListeners();
          this.showToast('削除しましたよ');
        }
      }
    });

    overlay.querySelector('#expenseForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const submitBtn = overlay.querySelector('button[type="submit"]');
      const originalSubmitText = submitBtn ? submitBtn.innerHTML : '';

      const currentType = formCostType.value;
      const amount = Number(overlay.querySelector('#formAmount').value);
      const title = overlay.querySelector('#formTitle').value.trim();
      const paidBy = inputPaidBy.value;
      const category = overlay.querySelector('#formCategory').value;
      const splitType = splitSelect.value;
      const customRatioA = splitType === 'custom' ? Number(customSlider.value) : null;

      if (!title || !amount) return;

      // 対象月の精算ロック確認
      const targetMonth = currentType === 'fixed'
        ? (overlay.querySelector('#formFixedStartMonth').value || this.currentMonth)
        : (overlay.querySelector('#formDate').value || getTodayString()).substring(0, 7);

      if (this.storage.isMonthSettled(targetMonth)) {
        alert(`【${this.formatMonthDisplay(targetMonth)}】は精算完了済みのため記録・変更できません。\nロックを解除してからお試しください。`);
        return;
      }

      // 二重登録防止：即座にボタン無効化＆ローディング表示
      isSubmitting = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳ 保存中...</span>';
        submitBtn.style.opacity = '0.7';
        submitBtn.style.pointerEvents = 'none';
      }

      try {
        const isUpdating = Boolean(editId);

        if (currentType === 'fixed') {
          const startMonth = overlay.querySelector('#formFixedStartMonth').value || this.currentMonth;
          let fixedId;

          if (isUpdating && originalType === 'fixed') {
            fixedId = editId; // 既存固定費のIDをそのまま引き継ぐ（UPDATE）
          } else {
            fixedId = `fx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            if (isUpdating && originalType === 'variable') {
              await this.storage.deleteExpense(editId);
            }
          }

          const newFixed = {
            id: fixedId,
            title,
            amount,
            paidBy,
            category,
            splitType,
            customRatioA,
            startMonth,
            endMonth: itemToEdit?.endMonth || null,
            active: true
          };

          await this.storage.saveFixedCost(newFixed);
          await this.loadData();

          if (!isUpdating) {
            // 新規登録時のみLINE通知
            const currentCalc = calculateSettlement({
              expenses: this.expenses,
              fixedCosts: this.fixedCosts,
              settings: this.settings,
              currentMonth: this.currentMonth
            });
            this.lineService.notifyFixedCostAdded(newFixed, currentCalc, this.settings);
          }

          close();
          this.render();
          this.attachEventListeners();
          this.showToast(isUpdating ? '固定費を更新しましたよ' : '固定費を記録しましたよ 🔄');
        } else {
          const date = overlay.querySelector('#formDate').value || getTodayString();
          let expenseId;

          if (isUpdating && originalType === 'variable') {
            expenseId = editId; // 既存支出のIDをそのまま引き継ぐ（UPDATE）
          } else {
            expenseId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            if (isUpdating && originalType === 'fixed') {
              await this.storage.deleteFixedCost(editId, this.currentMonth);
            }
          }

          const newExpense = {
            id: expenseId,
            title,
            amount,
            paidBy,
            category,
            date,
            splitType,
            customRatioA
          };

          await this.storage.saveExpense(newExpense);
          await this.loadData();

          if (!isUpdating) {
            // 新規登録時のみLINE通知
            const currentCalc = calculateSettlement({
              expenses: this.expenses,
              fixedCosts: this.fixedCosts,
              settings: this.settings,
              currentMonth: this.currentMonth
            });
            this.lineService.notifyExpenseAdded(newExpense, currentCalc, this.settings);
          }

          close();
          this.render();
          this.attachEventListeners();
          this.showToast(isUpdating ? '更新できましたよ' : '記録できましたよ ⚡');
        }
      } catch (err) {
        console.error('Save failed:', err);
        this.showToast('保存に失敗しました。もう一度お試しください');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalSubmitText;
          submitBtn.style.opacity = '1';
          submitBtn.style.pointerEvents = 'auto';
        }
        isSubmitting = false;
      }
    });
  }

  // 固定費追加・編集モーダル（登録月以降のみ反映＆特定月で削除時はそれ以降のみ削除）
  openFixedCostModal(itemToEdit = null) {
    const isEdit = !!itemToEdit;
    const { partnerAName, partnerBName, defaultRatioA } = this.settings;

    const initialPaidBy = itemToEdit ? itemToEdit.paidBy : 'A';
    const initialCategory = itemToEdit ? itemToEdit.category : 'housing';
    const initialSplitType = itemToEdit ? itemToEdit.splitType : 'default';
    const initialStartMonth = itemToEdit?.startMonth || this.currentMonth;

    const modalContainer = document.getElementById('modalContainer');
    modalContainer.innerHTML = `
      <div class="modal-overlay open" id="fixedCostModalOverlay">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">${isEdit ? '固定費を直す' : '固定費を追加する'}</h3>
            <button class="icon-btn" id="btnCloseFixedModal">✕</button>
          </div>
          <form id="fixedCostForm" class="modal-body">
            <div style="font-size: 0.8rem; color: var(--mochi-ink-sub);">
              登録した月（<strong>${this.formatMonthDisplay(initialStartMonth)}</strong>）以降の月に自動で反映されます。
            </div>

            <div class="form-group">
              <label class="form-label">項目名</label>
              <input type="text" id="fixedTitle" class="form-input" placeholder="例: 家賃、光回線" value="${itemToEdit ? itemToEdit.title : ''}" required autofocus />
            </div>

            <div class="form-group">
              <label class="form-label">月額料金 (円)</label>
              <input type="number" id="fixedAmount" class="form-input" placeholder="例: 96000" style="font-size: 1.4rem;" value="${itemToEdit ? itemToEdit.amount : ''}" required />
            </div>

            <div class="form-group">
              <label class="form-label">引落口座・カード担当</label>
              <div class="payer-toggle-group">
                <button type="button" class="payer-toggle-btn a ${initialPaidBy === 'A' ? 'selected' : ''}" id="btnFixedPayerA">
                  <div style="font-weight: 900;">${partnerAName}</div>
                  <div style="font-size: 0.75rem;">の口座</div>
                </button>
                <button type="button" class="payer-toggle-btn b ${initialPaidBy === 'B' ? 'selected' : ''}" id="btnFixedPayerB">
                  <div style="font-weight: 900;">${partnerBName}</div>
                  <div style="font-size: 0.75rem;">の口座</div>
                </button>
              </div>
              <input type="hidden" id="fixedPaidBy" value="${initialPaidBy}" />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">カテゴリ</label>
                <select id="fixedCategory" class="form-select">
                  ${Object.entries(CATEGORIES).map(([k, c]) => `
                    <option value="${k}" ${initialCategory === k ? 'selected' : ''}>${c.icon} ${c.name}</option>
                  `).join('')}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">負担ルール</label>
                <select id="fixedSplitType" class="form-select">
                  <option value="default" ${initialSplitType === 'default' ? 'selected' : ''}>基本比率 (${defaultRatioA}:${100 - defaultRatioA})</option>
                  <option value="half" ${initialSplitType === 'half' ? 'selected' : ''}>折半 (50:50)</option>
                  <option value="fullA" ${initialSplitType === 'fullA' ? 'selected' : ''}>全額 ${partnerAName}</option>
                  <option value="fullB" ${initialSplitType === 'fullB' ? 'selected' : ''}>全額 ${partnerBName}</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">開始月（この月以降に反映）</label>
              <input type="month" id="fixedStartMonth" class="form-input" value="${initialStartMonth}" />
            </div>
          </form>

          <div class="modal-footer">
            ${isEdit ? `
              <button type="button" class="btn-secondary" id="btnDeleteFixedFuture" style="color: #DC2626; font-size: 0.8rem;">
                今月以降を削除
              </button>
            ` : ''}
            <button type="button" class="btn-secondary" id="btnCancelFixed">やめる</button>
            <button type="submit" form="fixedCostForm" class="btn-primary">${isEdit ? '更新する' : '追加する'}</button>
          </div>
        </div>
      </div>
    `;

    const overlay = document.getElementById('fixedCostModalOverlay');
    const close = () => { overlay.classList.remove('open'); modalContainer.innerHTML = ''; };

    overlay.querySelector('#btnCloseFixedModal').addEventListener('click', close);
    overlay.querySelector('#btnCancelFixed').addEventListener('click', close);

    const btnPayerA = overlay.querySelector('#btnFixedPayerA');
    const btnPayerB = overlay.querySelector('#btnFixedPayerB');
    const inputPaidBy = overlay.querySelector('#fixedPaidBy');

    btnPayerA.addEventListener('click', () => {
      btnPayerA.classList.add('selected');
      btnPayerB.classList.remove('selected');
      inputPaidBy.value = 'A';
    });
    btnPayerB.addEventListener('click', () => {
      btnPayerB.classList.add('selected');
      btnPayerA.classList.remove('selected');
      inputPaidBy.value = 'B';
    });

    // 【フィードバック5】今月以降のみ削除する
    overlay.querySelector('#btnDeleteFixedFuture')?.addEventListener('click', async () => {
      const msg = `この固定費を【${this.formatMonthDisplay(this.currentMonth)}以降】削除しますか？\n（過去の月の記録はそのまま残ります）`;
      if (confirm(msg)) {
        await this.storage.deleteFixedCost(itemToEdit.id, this.currentMonth);
        await this.loadData();
        close();
        this.render();
        this.attachEventListeners();
        this.showToast('今月以降の固定費を削除しました');
      }
    });

    overlay.querySelector('#fixedCostForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = overlay.querySelector('#fixedTitle').value.trim();
      const amount = Number(overlay.querySelector('#fixedAmount').value);
      const paidBy = inputPaidBy.value;
      const category = overlay.querySelector('#fixedCategory').value;
      const splitType = overlay.querySelector('#fixedSplitType').value;
      const startMonth = overlay.querySelector('#fixedStartMonth').value || this.currentMonth;

      if (!title || !amount) return;

      const newFixed = {
        id: itemToEdit ? itemToEdit.id : `fx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        title,
        amount,
        paidBy,
        category,
        splitType,
        startMonth,
        endMonth: itemToEdit?.endMonth || null,
        active: true
      };

      await this.storage.saveFixedCost(newFixed);
      await this.loadData();

      // 固定費登録LINE通知
      const currentCalc = calculateSettlement({
        expenses: this.expenses,
        fixedCosts: this.fixedCosts,
        settings: this.settings,
        currentMonth: this.currentMonth
      });
      this.lineService.notifyFixedCostAdded(newFixed, currentCalc, this.settings);

      close();
      this.render();
      this.attachEventListeners();
      this.showToast(isEdit ? '更新できましたよ' : '追加できましたよ');
    });
  }

  // 設定モーダル（2人の名前・比率・LINE通知設定・リマインド日）
  openSettingsModal() {
    const { partnerAName, partnerBName, defaultRatioA, lineToken, lineTo, reminderDay, lineAutoNotify, appUrl } = this.settings;
    const modalContainer = document.getElementById('modalContainer');

    modalContainer.innerHTML = `
      <div class="modal-overlay open" id="settingsModalOverlay">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">もちもち設定</h3>
            <button class="icon-btn" id="btnCloseSettingsModal">✕</button>
          </div>
          <div class="modal-body">
            <div style="display: flex; align-items: center; justify-content: center; margin: 4px 0 10px;">
              <img src="/characters/mochi-calm.png" style="width: 80px;" alt="dog" />
            </div>

            <!-- 名前設定 -->
            <div class="form-group">
              <label class="form-label">2人のなまえ</label>
              <div class="form-row">
                <input type="text" id="settingNameA" class="form-input" value="${partnerAName}" placeholder="あなた" />
                <input type="text" id="settingNameB" class="form-input" value="${partnerBName}" placeholder="パートナー" />
              </div>
            </div>

            <!-- 比率スライダー -->
            <div class="form-group">
              <label class="form-label">基本の按分比率</label>
              <div class="ratio-slider-container">
                <div class="ratio-display-row">
                  <span>${partnerAName}: <span id="settingRatioValA">${defaultRatioA}</span>%</span>
                  <span>${partnerBName}: <span id="settingRatioValB">${100 - defaultRatioA}</span>%</span>
                </div>
                <input type="range" id="settingRatioSlider" class="custom-range-slider" min="0" max="100" step="5" value="${defaultRatioA}" />
                <div style="display: flex; gap: 6px; margin-top: 10px;">
                  <button type="button" class="btn-secondary" style="flex: 1; padding: 6px; font-size: 0.78rem;" id="set5050">50 : 50</button>
                  <button type="button" class="btn-secondary" style="flex: 1; padding: 6px; font-size: 0.78rem;" id="set6040">60 : 40</button>
                  <button type="button" class="btn-secondary" style="flex: 1; padding: 6px; font-size: 0.78rem;" id="set7030">70 : 30</button>
                </div>
              </div>
            </div>

            <!-- 【フィードバック3 & 4】LINEトークルーム連携 ＆ 自動リマインド設定 -->
            <div class="form-group" style="padding-top: 12px; border-top: 2px solid #E6DCC3;">
              <label class="form-label" style="display: flex; align-items: center; gap: 6px;">
                <span>💬 LINE自動送信 ＆ リマインド設定</span>
              </label>
              <div style="font-size: 0.78rem; color: var(--mochi-ink-sub); line-height: 1.5; margin-bottom: 8px;">
                LINE Bot（無料）を作成して2人のグループに招待すると、支出記録時の自動通知や月末のリマインドが届きます。
              </div>

              <div class="form-group">
                <label class="form-label" style="font-size: 0.78rem;">LINE Channel Access Token</label>
                <input type="password" id="settingLineToken" class="form-input" placeholder="LINE Developersのアクセストークン" value="${lineToken || ''}" />
              </div>

              <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                  <label class="form-label" style="font-size: 0.78rem;">送信先グループID または ユーザーID</label>
                  <button type="button" id="btnFetchWebhookId" class="btn-secondary" style="padding: 2px 8px; font-size: 0.72rem;">
                    🔍 WebhookからID取得
                  </button>
                </div>
                <input type="text" id="settingLineTo" class="form-input" placeholder="C123456... または U123456..." value="${lineTo || ''}" />
                <div style="font-size: 0.72rem; color: var(--mochi-ink-sub); line-height: 1.4; margin-top: 2px;">
                  💡 LINE DevelopersのWebhookに <code>${window.location.origin}/api/line-webhook</code> を設定し、グループでBotを招待または「ID」と発言すると自動検知できます。
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" style="font-size: 0.78rem;">アプリのアクセスURL（通知末尾に自動追記）</label>
                <input type="url" id="settingAppUrl" class="form-input" placeholder="${window.location.origin}" value="${appUrl || ''}" />
                <div style="font-size: 0.72rem; color: var(--mochi-ink-sub); line-height: 1.4; margin-top: 2px;">
                  💡 空欄の場合は現在アクセス中のURL（<code>${window.location.origin}</code>）が自動でLINE通知の末尾に記載されます。
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label" style="font-size: 0.78rem;">毎月の精算リマインド日</label>
                  <select id="settingReminderDay" class="form-select">
                    <option value="20" ${reminderDay == 20 ? 'selected' : ''}>毎月 20日</option>
                    <option value="25" ${reminderDay == 25 ? 'selected' : ''}>毎月 25日（給料日頃）</option>
                    <option value="28" ${reminderDay == 28 ? 'selected' : ''}>毎月 28日</option>
                    <option value="30" ${reminderDay == 30 ? 'selected' : ''}>毎月 30日</option>
                    <option value="31" ${reminderDay == 31 ? 'selected' : ''}>毎月 月末(31日)</option>
                  </select>
                </div>
                <div class="form-group" style="justify-content: flex-end;">
                  <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer;">
                    <input type="checkbox" id="settingLineAutoNotify" ${lineAutoNotify !== false ? 'checked' : ''} />
                    <span>支出記録時に即時送信</span>
                  </label>
                </div>
              </div>

              <button type="button" class="btn-secondary" id="btnTestLine" style="margin-top: 6px; font-size: 0.8rem;">
                今すぐLINEテスト送信 🐾
              </button>
            </div>

            <div class="form-group" style="padding-top: 12px; border-top: 2px solid #E6DCC3;">
              <div style="display: flex; gap: 8px;">
                <button type="button" class="btn-secondary" id="btnLoadDemo" style="flex: 1; font-size: 0.8rem;">
                  サンプルを入れ直す
                </button>
                <button type="button" class="btn-secondary" id="btnClearAll" style="font-size: 0.8rem; color: #DC2626;">
                  初期化
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="btnCancelSettings">やめる</button>
            <button type="button" class="btn-primary" id="btnSaveSettings">保存する</button>
          </div>
        </div>
      </div>
    `;

    const overlay = document.getElementById('settingsModalOverlay');
    const close = () => { overlay.classList.remove('open'); modalContainer.innerHTML = ''; };

    overlay.querySelector('#btnCloseSettingsModal').addEventListener('click', close);
    overlay.querySelector('#btnCancelSettings').addEventListener('click', close);

    const slider = overlay.querySelector('#settingRatioSlider');
    const valA = overlay.querySelector('#settingRatioValA');
    const valB = overlay.querySelector('#settingRatioValB');

    slider.addEventListener('input', () => {
      const v = parseInt(slider.value, 10);
      valA.textContent = v;
      valB.textContent = 100 - v;
    });

    const setR = (v) => {
      slider.value = v;
      valA.textContent = v;
      valB.textContent = 100 - v;
    };
    overlay.querySelector('#set5050').addEventListener('click', () => setR(50));
    overlay.querySelector('#set6040').addEventListener('click', () => setR(60));
    overlay.querySelector('#set7030').addEventListener('click', () => setR(70));

    // LINEテスト送信
    overlay.querySelector('#btnTestLine').addEventListener('click', async () => {
      const token = overlay.querySelector('#settingLineToken').value.trim();
      const to = overlay.querySelector('#settingLineTo').value.trim();
      const customAppUrl = overlay.querySelector('#settingAppUrl')?.value.trim();
      if (!token || !to) {
        alert('LINE Tokenと送信先IDを入力してください');
        return;
      }
      this.settings.lineToken = token;
      this.settings.lineTo = to;
      if (customAppUrl !== undefined) {
        this.settings.appUrl = customAppUrl;
      }
      const calc = calculateSettlement({
        expenses: this.expenses,
        fixedCosts: this.fixedCosts,
        settings: this.settings,
        currentMonth: this.currentMonth
      });
      const ok = await this.lineService.sendSettlementReminder(calc, this.settings, this.formatMonthDisplay(this.currentMonth));
      if (ok) {
        this.showToast('LINEにテストメッセージを送りましたよ！');
      } else {
        alert('LINE送信に失敗しました。トークンや送信先IDを確認してください。');
      }
    });

    overlay.querySelector('#btnFetchWebhookId')?.addEventListener('click', async () => {
      const btn = overlay.querySelector('#btnFetchWebhookId');
      btn.textContent = '確認中...';
      try {
        const res = await fetch('/api/line-webhook');
        const data = await res.json();
        const id = data?.lastDetected?.groupId;
        if (id) {
          overlay.querySelector('#settingLineTo').value = id;
          this.showToast('グループIDを取得・入力しましたよ！');
        } else {
          alert('まだグループIDが検知されていません。\nLINE DevelopersでWebhook URLを設定後、グループ内でBotにメンションするか「ID」と発言してください。');
        }
      } catch (err) {
        alert('取得に失敗しました: ' + err.message);
      } finally {
        btn.textContent = '🔍 WebhookからID取得';
      }
    });

    overlay.querySelector('#btnLoadDemo').addEventListener('click', async () => {
      if (this.storage.isConnected || this.storage.getSupabaseConfig().url) {
        alert('現在クラウド同期が有効です。本番データベースのデータを保護するため、同期中のサンプルデータ投入はできません。');
        return;
      }
      if (confirm('サンプルデータを入れ直しますか？')) {
        await this.storage.loadDemoData(this.currentMonth);
        await this.loadData();
        close();
        this.render();
        this.attachEventListeners();
        this.showToast('サンプルを入れましたよ');
      }
    });

    overlay.querySelector('#btnClearAll').addEventListener('click', async () => {
      if (confirm('すべての記録をリセットしますか？')) {
        await this.storage.clearAll();
        await this.loadData();
        close();
        this.render();
        this.attachEventListeners();
        this.showToast('きれいにリセットしました');
      }
    });

    overlay.querySelector('#btnSaveSettings').addEventListener('click', () => {
      const nameA = overlay.querySelector('#settingNameA').value.trim() || 'あなた';
      const nameB = overlay.querySelector('#settingNameB').value.trim() || 'パートナー';
      const rA = parseInt(slider.value, 10);
      const rB = 100 - rA;
      const lineTokenVal = overlay.querySelector('#settingLineToken').value.trim();
      const lineToVal = overlay.querySelector('#settingLineTo').value.trim();
      const reminderDayVal = Number(overlay.querySelector('#settingReminderDay').value) || 25;
      const autoNotifyVal = overlay.querySelector('#settingLineAutoNotify').checked;
      const appUrlVal = overlay.querySelector('#settingAppUrl')?.value.trim() || '';

      this.storage.saveSettings({
        partnerAName: nameA,
        partnerBName: nameB,
        defaultRatioA: rA,
        defaultRatioB: rB,
        lineToken: lineTokenVal,
        lineTo: lineToVal,
        reminderDay: reminderDayVal,
        lineAutoNotify: autoNotifyVal,
        appUrl: appUrlVal
      });
      this.settings = this.storage.settings;

      close();
      this.render();
      this.attachEventListeners();
      this.showToast('設定できましたよ');
    });
  }

  // クラウド同期 (Supabase) モーダル
  openSyncModal() {
    const cfg = this.storage.getSupabaseConfig();
    const isConnected = this.storage.isConnected;
    const modalContainer = document.getElementById('modalContainer');

    modalContainer.innerHTML = `
      <div class="modal-overlay open" id="syncModalOverlay">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">☁️ 2人でリアルタイム同期</h3>
            <button class="icon-btn" id="btnCloseSyncModal">✕</button>
          </div>
          <div class="modal-body">
            <div style="font-size: 0.85rem; color: var(--mochi-ink-sub); line-height: 1.7;">
              無料のSupabaseを連携すると、<strong>お互いのスマホから入力した瞬間にシーソーが動く</strong>ようになります。
            </div>

            <div style="background: var(--mochi-kinako); border: var(--line-main); border-radius: var(--radius-m); padding: 12px 14px; font-weight: 700; font-size: 0.85rem;">
              状態: ${isConnected ? 'クラウドと同期中です 🟢' : 'この端末だけに保存されています 🟡'}
            </div>

            ${isConnected ? `
              <div style="background: var(--mochi-milk); border: var(--line-main); border-radius: var(--radius-m); padding: 14px; box-shadow: 0 3px 0 var(--mochi-ink);">
                <div style="font-weight: 800; font-size: 0.88rem; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                  <span>🐾</span><span>パートナーにかんたん連携URLを送る</span>
                </div>
                <div style="font-size: 0.78rem; color: var(--mochi-ink-sub); margin-bottom: 10px; line-height: 1.5;">
                  下のボタンを押してLINE等でURLを送ると、パートナー側はURLを開くだけで自動的に同じデータと同期されます！
                </div>
                <button type="button" class="btn-primary" id="btnCopyInviteLink" style="width: 100%; padding: 8px 12px; font-size: 0.82rem; justify-content: center;">
                  🔗 招待リンクをコピーする
                </button>
              </div>
            ` : ''}

            <div class="form-group">
              <label class="form-label">Supabase URL</label>
              <input type="text" id="syncUrl" class="form-input" placeholder="https://xxxxxxxx.supabase.co" value="${cfg.url || ''}" />
            </div>

            <div class="form-group">
              <label class="form-label">Supabase Anon Key</label>
              <input type="password" id="syncKey" class="form-input" placeholder="eyJhbGciOiJIUzI1NiIsInR5..." value="${cfg.key || ''}" />
            </div>

            <details style="background: var(--mochi-milk); border: var(--line-main); border-radius: var(--radius-m); padding: 10px 14px; font-size: 0.8rem;">
              <summary style="cursor: pointer; font-weight: 800; color: var(--mochi-konga);">
                テーブル作成用SQLはこちら
              </summary>
              <div style="margin-top: 10px;">
                <button type="button" class="btn-secondary" id="btnCopySql" style="padding: 4px 10px; font-size: 0.75rem; margin-bottom: 8px;">
                  SQLをコピーする
                </button>
                <pre style="background: #FFF; padding: 10px; border-radius: 8px; border: 1.5px solid var(--mochi-ink); max-height: 140px; overflow-x: auto; font-size: 0.7rem;">${SUPABASE_SETUP_SQL}</pre>
              </div>
            </details>

            <!-- 削除や更新ができない場合のRLS解除案内 -->
            <div style="background: #FEF3C7; border: 1.5px solid #D97706; border-radius: var(--radius-m); padding: 10px 12px; font-size: 0.76rem; line-height: 1.5; margin-top: 10px;">
              <div style="font-weight: 800; color: #92400E; margin-bottom: 3px;">
                ⚠️ 削除や更新がクラウドに反映されない場合（RLS権限）
              </div>
              <div style="color: #78350F; margin-bottom: 6px; font-size: 0.72rem;">
                SupabaseのRow Level Security (RLS) で削除がブロックされている可能性があります。下のSQLをSupabaseのSQL Editorで一度実行すると全端末で正常に同期・削除できるようになります。
              </div>
              <button type="button" class="btn-secondary" id="btnCopyDisableRls" style="padding: 4px 10px; font-size: 0.72rem; background: #FFF;">
                ⚡ RLS無効化SQLをコピー
              </button>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="btnCancelSync">やめる</button>
            <button type="button" class="btn-primary" id="btnSaveSync">つなぐ</button>
          </div>
        </div>
      </div>
    `;

    const overlay = document.getElementById('syncModalOverlay');
    const close = () => { overlay.classList.remove('open'); modalContainer.innerHTML = ''; };

    overlay.querySelector('#btnCloseSyncModal').addEventListener('click', close);
    overlay.querySelector('#btnCancelSync').addEventListener('click', close);

    overlay.querySelector('#btnCopyInviteLink')?.addEventListener('click', () => {
      const inviteUrl = `${window.location.origin}${window.location.pathname}?supabase_url=${encodeURIComponent(cfg.url)}&supabase_key=${encodeURIComponent(cfg.key)}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(inviteUrl).then(() => {
          this.showToast('招待リンクをコピーしましたよ');
        });
      } else {
        prompt('このURLをパートナーに送ってください:', inviteUrl);
      }
    });

    overlay.querySelector('#btnCopySql')?.addEventListener('click', () => {
      navigator.clipboard.writeText(SUPABASE_SETUP_SQL).then(() => {
        this.showToast('SQLをコピーしましたよ');
      });
    });

    overlay.querySelector('#btnCopyDisableRls')?.addEventListener('click', () => {
      const rlsSql = `alter table public.pairpay_expenses disable row level security;\nalter table public.pairpay_fixed_costs disable row level security;\nalter table public.pairpay_settings disable row level security;`;
      navigator.clipboard.writeText(rlsSql).then(() => {
        this.showToast('RLS解除SQLをコピーしましたよ！');
      });
    });

    overlay.querySelector('#btnSaveSync').addEventListener('click', async () => {
      const url = overlay.querySelector('#syncUrl').value.trim();
      const key = overlay.querySelector('#syncKey').value.trim();

      const btn = overlay.querySelector('#btnSaveSync');
      btn.disabled = true;
      btn.textContent = '接続中...';

      const res = await this.storage.saveSupabaseConfig(url, key);
      btn.disabled = false;
      btn.textContent = 'つなぐ';

      if (res && res.success) {
        await this.loadData();
        close();
        this.render();
        this.attachEventListeners();

        if (url && key) {
          this.showToast('つながりましたよ！🟢');
        } else {
          this.showToast('端末保存に戻しました');
        }
      } else {
        alert(res?.error || '接続に失敗しました。URLとAnon Keyを確認してください。');
      }
    });
  }

  handleShareLine() {
    const calc = calculateSettlement({
      expenses: this.expenses,
      fixedCosts: this.fixedCosts,
      settings: this.settings,
      currentMonth: this.currentMonth
    });

    const monthLabel = this.formatMonthDisplay(this.currentMonth);
    const text = generateShareText({
      calculation: calc,
      settings: this.settings,
      monthLabel
    });

    const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast('メッセージをコピーしましたよ');
        setTimeout(() => window.open(lineUrl, '_blank'), 400);
      }).catch(() => window.open(lineUrl, '_blank'));
    } else {
      window.open(lineUrl, '_blank');
    }
  }

  handleSettleCelebration() {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
    this.showToast('できましたよ 🎉');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new MochiBudgetApp();
});
