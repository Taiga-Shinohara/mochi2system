import './style.css';
import confetti from 'canvas-confetti';
import { StorageService, CATEGORIES, SUPABASE_SETUP_SQL } from './db.js';
import { calculateSettlement, generateShareText } from './calculator.js';
import { renderMochiDog, renderCaption } from './characters.js';

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
    this.activeTab = 'all'; // 'all', 'variable', 'fixed', 'charts'
    this.selectedCategoryFilter = 'all';

    this.expenses = [];
    this.fixedCosts = [];
    this.settings = this.storage.settings;

    this.init();
  }

  async init() {
    this.storage.setSyncCallback(async () => {
      this.showToast('もちもち同期しましたよ');
      await this.loadData();
      this.render();
      this.attachEventListeners();
    });

    await this.loadData();

    if (this.expenses.length === 0 && this.fixedCosts.length === 0) {
      await this.storage.loadDemoData(this.currentMonth);
      await this.loadData();
    }

    this.render();
    this.attachEventListeners();
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

  render() {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    const calc = calculateSettlement({
      expenses: this.expenses,
      fixedCosts: this.fixedCosts,
      settings: this.settings,
      currentMonth: this.currentMonth
    });

    const isConnected = this.storage.isConnected;
    const { partnerAName, partnerBName, defaultRatioA, defaultRatioB } = this.settings;

    // フィルタリング
    let displayedItems = calc.allItems;
    if (this.activeTab === 'variable') {
      displayedItems = displayedItems.filter(i => !i.isFixed);
    } else if (this.activeTab === 'fixed') {
      displayedItems = displayedItems.filter(i => i.isFixed);
    }

    if (this.selectedCategoryFilter !== 'all') {
      displayedItems = displayedItems.filter(i => i.category === this.selectedCategoryFilter);
    }

    // もちもち犬のポーズとセリフの決定
    let dogPose = 'tilt';
    let captionText = 'わかっていますよ';

    if (calc.status === 'even') {
      dogPose = 'smile';
      captionText = 'でも幸せならOKです';
    } else if (calc.transferAmount > 30000) {
      dogPose = 'tilt';
      captionText = 'あとまだ24時間もある';
    }

    appEl.innerHTML = `
      <!-- ヘッダー -->
      <header class="app-header">
        <div class="brand" id="btnLogo">
          <img src="/icon.svg" class="brand-icon" alt="もちもち犬" />
          <span class="brand-title">もちもち生活費</span>
        </div>
        <div class="header-actions">
          <button class="sync-badge" id="btnOpenSync" title="同期設定">
            <span class="sync-dot ${isConnected ? 'connected' : ''}"></span>
            <span>${isConnected ? '同期中' : '端末保存'}</span>
          </button>
          <button class="icon-btn" id="btnOpenSettings" title="設定・比率">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      <!-- 月ナビゲーション -->
      <div class="month-nav-container">
        <div class="month-selector">
          <button class="month-btn" id="btnPrevMonth">◀</button>
          <span class="current-month-label" id="btnCurrentMonth">${this.formatMonthDisplay(this.currentMonth)}</span>
          <button class="month-btn" id="btnNextMonth">▶</button>
        </div>
        <div class="quick-stats-badge">
          比率: ${partnerAName} ${defaultRatioA}% : ${partnerBName} ${defaultRatioB}%
        </div>
      </div>

      <!-- メインエリア -->
      <main>
        <!-- もちもち犬 ヒーロー精算カード -->
        <section class="mochi-card settlement-hero">
          <!-- もちもち犬キャラクター ＆ 黒帯キャプション -->
          <div class="hero-character-wrapper">
            ${renderMochiDog(dogPose, 130, 'mochi-float')}
            ${renderCaption(captionText)}
          </div>

          <!-- 精算金額ボックス -->
          <div class="settlement-amount-box">
            ${calc.status === 'even' ? `
              <div class="settlement-subtitle">今月の精算はぴったりです</div>
              <div class="settlement-title even">
                <span>イーブンですよ</span>
              </div>
            ` : `
              <div class="settlement-subtitle">
                <strong>${calc.payerName}</strong> から <strong>${calc.receiverName}</strong> へのお支払い
              </div>
              <div class="settlement-title">
                <span class="yen-mark">¥</span>
                <span>${calc.transferAmount.toLocaleString()}</span>
              </div>
            `}
          </div>

          <!-- もちもちシーソーメーター -->
          <div class="seesaw-container">
            <div class="seesaw-partners-row">
              <span class="partner-pill a">
                <span>🐾 ${partnerAName}</span>
              </span>
              <span style="font-size: 0.78rem; font-weight: 700; color: var(--mochi-ink-sub);">
                精算シーソー
              </span>
              <span class="partner-pill b">
                <span>🐾 ${partnerBName}</span>
              </span>
            </div>

            <!-- シーソーボード -->
            <div class="seesaw-board">
              <div class="seesaw-center-line"></div>
              <div class="seesaw-fulcrum"></div>
              <!-- シーソーの上に乗るミニもちもち犬 -->
              <div class="seesaw-indicator-dog" style="left: ${calc.needlePosition}%;">
                ${renderMochiDog('round', 38)}
              </div>
            </div>

            <div class="seesaw-labels">
              <span>◀ ${partnerAName}が立替中</span>
              <span style="color: var(--mochi-ink);">イーブン</span>
              <span>${partnerBName}が立替中 ▶</span>
            </div>
          </div>

          <!-- 2人の状況（デュアルカード） -->
          <div class="dual-status-grid">
            <div class="person-card a">
              <div class="person-header">
                <span class="person-name">${partnerAName}</span>
                <span class="person-ratio-tag">${defaultRatioA}%</span>
              </div>
              <div class="person-paid-val">¥${calc.totalPaidA.toLocaleString()}</div>
              <div class="person-goal-val">目安: ¥${calc.totalOwedA.toLocaleString()}</div>
              <div class="person-diff-val ${calc.balanceA >= 0 ? 'plus' : 'minus'}">
                ${calc.balanceA >= 0 ? `+¥${calc.balanceA.toLocaleString()} (立替)` : `-¥${Math.abs(calc.balanceA).toLocaleString()} (不足)`}
              </div>
            </div>

            <div class="person-card b">
              <div class="person-header">
                <span class="person-name">${partnerBName}</span>
                <span class="person-ratio-tag">${defaultRatioB}%</span>
              </div>
              <div class="person-paid-val">¥${calc.totalPaidB.toLocaleString()}</div>
              <div class="person-goal-val">目安: ¥${calc.totalOwedB.toLocaleString()}</div>
              <div class="person-diff-val ${calc.balanceB >= 0 ? 'plus' : 'minus'}">
                ${calc.balanceB >= 0 ? `+¥${calc.balanceB.toLocaleString()} (立替)` : `-¥${Math.abs(calc.balanceB).toLocaleString()} (不足)`}
              </div>
            </div>
          </div>

          <!-- ボタン群 -->
          <div class="settlement-actions">
            <button class="btn-primary" id="btnShareLine">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 5.92 2 10.75c0 3.12 1.88 5.86 4.71 7.35-.21.75-.76 2.73-.87 3.14-.14.5.18.5.38.36.16-.11 2.5-1.7 3.51-2.39.73.13 1.49.2 2.27.2 5.52 0 10-3.92 10-8.75S17.52 2 12 2z"/>
              </svg>
              <span>LINEでお知らせ</span>
            </button>
            <button class="btn-secondary" id="btnSettleDone">
              <span>精算完了 🎉</span>
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

        <!-- タブバー -->
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
            <span class="badge">${this.fixedCosts.filter(f => f.active).length}</span>
          </button>
          <button class="mochi-tab ${this.activeTab === 'charts' ? 'active' : ''}" data-tab="charts">
            <span>内訳</span>
          </button>
        </nav>

        ${this.activeTab === 'fixed' ? `
          <div class="fixed-cost-intro-banner">
            <div>
              <div style="font-weight: 900; font-size: 0.95rem;">毎月の固定費</div>
              <div style="font-size: 0.78rem; color: var(--mochi-ink-sub);">家賃や通信費など毎月自動で合算されます</div>
            </div>
            <button class="btn-secondary" id="btnAddFixedCost" style="padding: 8px 14px; font-size: 0.85rem;">
              + 固定費を追加
            </button>
          </div>
        ` : ''}

        ${this.activeTab === 'charts' ? `
          <!-- 内訳グラフ -->
          <section class="mochi-card" style="padding: 20px;">
            <div style="font-weight: 900; font-size: 1.05rem; margin-bottom: 16px;">
              📊 ${this.formatMonthDisplay(this.currentMonth)} カテゴリ別
            </div>
            ${Object.keys(calc.categoryTotals).length === 0 ? `
              <div class="empty-mochi-box">
                ${renderMochiDog('calm', 80)}
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
          <!-- カテゴリフィルター -->
          <div class="category-filter-bar">
            <button class="mochi-chip ${this.selectedCategoryFilter === 'all' ? 'active' : ''}" data-cat="all">すべて</button>
            ${Object.entries(CATEGORIES).map(([key, cat]) => `
              <button class="mochi-chip ${this.selectedCategoryFilter === key ? 'active' : ''}" data-cat="${key}">
                ${cat.icon} ${cat.name}
              </button>
            `).join('')}
          </div>

          <!-- 支出リスト -->
          <section class="expense-items-list">
            ${displayedItems.length === 0 ? `
              <div class="empty-mochi-box">
                ${renderMochiDog('calm', 90)}
                ${renderCaption('データはまだないです')}
                <div style="font-size: 0.85rem; color: var(--mochi-ink-sub); margin-top: 6px;">
                  右下の「＋ 記録する」からのんびり登録してくださいね
                </div>
              </div>
            ` : displayedItems.map(item => {
              const cat = CATEGORIES[item.category] || CATEGORIES.other;
              const isPayerA = item.paidBy === 'A';
              const payerName = isPayerA ? partnerAName : partnerBName;

              let splitText = '比率通り';
              if (item.splitType === 'half') splitText = '折半';
              if (item.splitType === 'fullA') splitText = `${partnerAName}全額`;
              if (item.splitType === 'fullB') splitText = `${partnerBName}全額`;
              if (item.splitType === 'custom') splitText = `カスタム (${item.customRatioA}%)`;

              return `
                <div class="expense-card-item" data-id="${item.id}" data-is-fixed="${item.isFixed}">
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

      <!-- FAB 支出記録ボタン -->
      <button class="mochi-fab" id="btnOpenExpenseModal">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>記録する</span>
      </button>

      <!-- トースト通知 -->
      <div id="toastNotification" class="toast"></div>

      <!-- モーダル格納用コンテナ -->
      <div id="modalContainer"></div>
    `;
  }

  attachEventListeners() {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    appEl.querySelector('#btnOpenSync')?.addEventListener('click', () => this.openSyncModal());
    appEl.querySelector('#btnOpenSettings')?.addEventListener('click', () => this.openSettingsModal());
    appEl.querySelector('#btnLogo')?.addEventListener('click', () => this.openSettingsModal());

    appEl.querySelector('#btnPrevMonth')?.addEventListener('click', () => this.changeMonth(-1));
    appEl.querySelector('#btnNextMonth')?.addEventListener('click', () => this.changeMonth(1));
    appEl.querySelector('#btnCurrentMonth')?.addEventListener('click', () => {
      this.currentMonth = getCurrentMonthString();
      this.render();
      this.attachEventListeners();
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

    appEl.querySelector('#btnOpenExpenseModal')?.addEventListener('click', () => {
      this.openExpenseModal(null);
    });

    appEl.querySelector('#btnAddFixedCost')?.addEventListener('click', () => {
      this.openFixedCostModal(null);
    });

    appEl.querySelector('#btnShareLine')?.addEventListener('click', () => {
      this.handleShareLine();
    });

    appEl.querySelector('#btnSettleDone')?.addEventListener('click', () => {
      this.handleSettleCelebration();
    });

    appEl.querySelectorAll('.expense-card-item').forEach(itemEl => {
      itemEl.addEventListener('click', () => {
        const id = itemEl.dataset.id;
        const isFixed = itemEl.dataset.isFixed === 'true';
        if (isFixed) {
          const realId = id.replace('fixed_', '');
          const target = this.fixedCosts.find(f => f.id === realId);
          if (target) this.openFixedCostModal(target);
        } else {
          const target = this.expenses.find(x => x.id === id);
          if (target) this.openExpenseModal(target);
        }
      });
    });
  }

  // 支出追加・編集モーダル
  openExpenseModal(itemToEdit = null) {
    const isEdit = !!itemToEdit;
    const { partnerAName, partnerBName, defaultRatioA } = this.settings;

    const initialPaidBy = itemToEdit ? itemToEdit.paidBy : 'A';
    const initialCategory = itemToEdit ? itemToEdit.category : 'food';
    const initialSplitType = itemToEdit ? itemToEdit.splitType : 'default';
    const initialCustomRatioA = itemToEdit?.customRatioA != null ? itemToEdit.customRatioA : defaultRatioA;

    const modalContainer = document.getElementById('modalContainer');
    modalContainer.innerHTML = `
      <div class="modal-overlay open" id="expenseModalOverlay">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">${isEdit ? '支出を直す' : '支出を記録する'}</h3>
            <button class="icon-btn" id="btnCloseExpenseModal">✕</button>
          </div>
          <form id="expenseForm" class="modal-body">
            <div class="form-group">
              <label class="form-label">どちらが支払いましたか？</label>
              <div class="payer-toggle-group">
                <button type="button" class="payer-toggle-btn a ${initialPaidBy === 'A' ? 'selected' : ''}" id="btnPayerA">
                  <div style="font-weight: 900; font-size: 1rem;">${partnerAName}</div>
                  <div style="font-size: 0.75rem;">が立替えた</div>
                </button>
                <button type="button" class="payer-toggle-btn b ${initialPaidBy === 'B' ? 'selected' : ''}" id="btnPayerB">
                  <div style="font-weight: 900; font-size: 1rem;">${partnerBName}</div>
                  <div style="font-size: 0.75rem;">が立替えた</div>
                </button>
              </div>
              <input type="hidden" id="formPaidBy" value="${initialPaidBy}" />
            </div>

            <div class="form-group">
              <label class="form-label">金額 (円)</label>
              <input type="number" id="formAmount" class="form-input" placeholder="例: 3500" style="font-size: 1.4rem;" value="${itemToEdit ? itemToEdit.amount : ''}" required autofocus />
            </div>

            <div class="form-group">
              <label class="form-label">使った内容</label>
              <input type="text" id="formTitle" class="form-input" placeholder="例: スーパーで食材まとめ買い" value="${itemToEdit ? itemToEdit.title : ''}" required />
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
              <div class="form-group">
                <label class="form-label">日付</label>
                <input type="date" id="formDate" class="form-input" value="${itemToEdit ? itemToEdit.date : getTodayString()}" />
              </div>
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
                削除する
              </button>
            ` : ''}
            <button type="button" class="btn-secondary" id="btnCancelExpense">やめる</button>
            <button type="submit" form="expenseForm" class="btn-primary">${isEdit ? '更新する' : '保存する'}</button>
          </div>
        </div>
      </div>
    `;

    const overlay = document.getElementById('expenseModalOverlay');
    const close = () => { overlay.classList.remove('open'); modalContainer.innerHTML = ''; };

    overlay.querySelector('#btnCloseExpenseModal').addEventListener('click', close);
    overlay.querySelector('#btnCancelExpense').addEventListener('click', close);

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

    overlay.querySelector('#btnDeleteExpense')?.addEventListener('click', async () => {
      if (confirm('この記録を消してもよろしいですか？')) {
        await this.storage.deleteExpense(itemToEdit.id);
        await this.loadData();
        close();
        this.render();
        this.attachEventListeners();
        this.showToast('削除しましたよ');
      }
    });

    overlay.querySelector('#expenseForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = Number(overlay.querySelector('#formAmount').value);
      const title = overlay.querySelector('#formTitle').value.trim();
      const paidBy = inputPaidBy.value;
      const category = overlay.querySelector('#formCategory').value;
      const date = overlay.querySelector('#formDate').value;
      const splitType = splitSelect.value;
      const customRatioA = splitType === 'custom' ? Number(customSlider.value) : null;

      if (!title || !amount) return;

      const newExpense = {
        id: itemToEdit ? itemToEdit.id : `exp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
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
      close();
      this.render();
      this.attachEventListeners();
      this.showToast(isEdit ? '更新できましたよ' : '記録できましたよ');
    });
  }

  // 固定費モーダル
  openFixedCostModal(itemToEdit = null) {
    const isEdit = !!itemToEdit;
    const { partnerAName, partnerBName, defaultRatioA } = this.settings;

    const initialPaidBy = itemToEdit ? itemToEdit.paidBy : 'A';
    const initialCategory = itemToEdit ? itemToEdit.category : 'housing';
    const initialSplitType = itemToEdit ? itemToEdit.splitType : 'default';

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
              家賃や光回線など、毎月自動的に加算される項目です。
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
          </form>

          <div class="modal-footer">
            ${isEdit ? `
              <button type="button" class="btn-secondary" id="btnDeleteFixedCost" style="color: #DC2626;">
                削除する
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

    overlay.querySelector('#btnDeleteFixedCost')?.addEventListener('click', async () => {
      if (confirm('この固定費を消してもよろしいですか？')) {
        await this.storage.deleteFixedCost(itemToEdit.id);
        await this.loadData();
        close();
        this.render();
        this.attachEventListeners();
        this.showToast('削除しましたよ');
      }
    });

    overlay.querySelector('#fixedCostForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = overlay.querySelector('#fixedTitle').value.trim();
      const amount = Number(overlay.querySelector('#fixedAmount').value);
      const paidBy = inputPaidBy.value;
      const category = overlay.querySelector('#fixedCategory').value;
      const splitType = overlay.querySelector('#fixedSplitType').value;

      if (!title || !amount) return;

      const newFixed = {
        id: itemToEdit ? itemToEdit.id : `fx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        title,
        amount,
        paidBy,
        category,
        splitType,
        active: true
      };

      await this.storage.saveFixedCost(newFixed);
      await this.loadData();
      close();
      this.render();
      this.attachEventListeners();
      this.showToast(isEdit ? '更新できましたよ' : '追加できましたよ');
    });
  }

  // 設定モーダル
  openSettingsModal() {
    const { partnerAName, partnerBName, defaultRatioA } = this.settings;
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
              ${renderMochiDog('round', 70)}
            </div>

            <div class="form-group">
              <label class="form-label">2人のなまえ</label>
              <div class="form-row">
                <input type="text" id="settingNameA" class="form-input" value="${partnerAName}" placeholder="あなた" />
                <input type="text" id="settingNameB" class="form-input" value="${partnerBName}" placeholder="パートナー" />
              </div>
            </div>

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

    overlay.querySelector('#btnLoadDemo').addEventListener('click', async () => {
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

      this.storage.saveSettings({
        partnerAName: nameA,
        partnerBName: nameB,
        defaultRatioA: rA,
        defaultRatioB: rB
      });
      this.settings = this.storage.settings;

      close();
      this.render();
      this.attachEventListeners();
      this.showToast('設定できましたよ');
    });
  }

  // 同期モーダル
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

    overlay.querySelector('#btnCopySql')?.addEventListener('click', () => {
      navigator.clipboard.writeText(SUPABASE_SETUP_SQL).then(() => {
        this.showToast('SQLをコピーしましたよ');
      });
    });

    overlay.querySelector('#btnSaveSync').addEventListener('click', async () => {
      const url = overlay.querySelector('#syncUrl').value.trim();
      const key = overlay.querySelector('#syncKey').value.trim();

      const success = await this.storage.saveSupabaseConfig(url, key);
      await this.loadData();
      close();
      this.render();
      this.attachEventListeners();

      if (success) {
        this.showToast('つながりましたよ！');
      } else if (!url && !key) {
        this.showToast('端末保存に戻しました');
      } else {
        this.showToast('あれれ、ちょっとつぶれました');
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
