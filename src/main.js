import './style.css';
import confetti from 'canvas-confetti';
import { StorageService, CATEGORIES, SUPABASE_SETUP_SQL } from './db.js';
import { calculateSettlement, generateShareText } from './calculator.js';

// 日付ユーティリティ
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

class PairPayApp {
  constructor() {
    this.storage = new StorageService();
    this.currentMonth = getCurrentMonthString();
    this.activeTab = 'all'; // 'all', 'variable', 'fixed', 'charts'
    this.selectedCategoryFilter = 'all';
    
    this.expenses = [];
    this.fixedCosts = [];
    this.settings = this.storage.settings;

    this.editingExpense = null;
    this.editingFixedCost = null;

    this.init();
  }

  async init() {
    // リアルタイム同期コールバック登録
    this.storage.setSyncCallback(async (table) => {
      this.showToast(`クラウドから最新データを同期しました (${table})`);
      await this.loadData();
      this.render();
    });

    await this.loadData();

    // 初回起動時、支出も固定費もなければデモデータを投入して即座に体験できるようにする
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

  // 月変更
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

    // HTML構築
    appEl.innerHTML = `
      <!-- App Header -->
      <header class="app-header">
        <div class="brand" id="btnLogo">
          <img src="/icon.svg" class="brand-icon" alt="ふたりペイ" />
          <span class="brand-title">ふたりペイ</span>
        </div>
        <div class="header-actions">
          <button class="sync-badge" id="btnOpenSync" title="クラウド同期設定">
            <span class="sync-dot ${isConnected ? 'connected' : 'local'}"></span>
            <span>${isConnected ? 'クラウド同期中' : '端末に保存中'}</span>
          </button>
          <button class="icon-btn" id="btnOpenSettings" title="設定・比率変更">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
      </header>

      <!-- Month Selector -->
      <div class="month-nav-container">
        <div class="month-selector">
          <button class="month-btn" id="btnPrevMonth" title="前月">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <span class="current-month-label" id="btnCurrentMonth">${this.formatMonthDisplay(this.currentMonth)}</span>
          <button class="month-btn" id="btnNextMonth" title="翌月">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
        <div class="quick-stats-badge">
          按分比率: ${partnerAName} ${defaultRatioA}% : ${partnerBName} ${defaultRatioB}%
        </div>
      </div>

      <!-- Main Content -->
      <main class="main-content">
        <!-- Settlement Hero Card with Seesaw Balance Meter -->
        <section class="settlement-card">
          <div class="settlement-status-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <span>今月の精算ステータス</span>
          </div>

          <div class="settlement-result">
            ${calc.status === 'even' ? `
              <div class="settlement-main-amount even">
                <span>🎉 ピッタリ精算完了！</span>
              </div>
              <div class="settlement-action-text">現在お互いの支払いは均等・按分通りです</div>
            ` : `
              <div class="settlement-action-text">
                <span class="payer-target-tag ${calc.payerKey.toLowerCase()}">${calc.payerName}</span> が 
                <span class="payer-target-tag ${calc.receiverKey.toLowerCase()}">${calc.receiverName}</span> へ支払う
              </div>
              <div class="settlement-main-amount">
                <span class="currency">¥</span>
                <span>${calc.transferAmount.toLocaleString()}</span>
              </div>
            `}
          </div>

          <!-- Balance Scale Seesaw Meter -->
          <div class="meter-container">
            <div class="meter-header">
              <div class="partner-label">
                <span class="partner-dot a"></span>
                <span>${partnerAName}</span>
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">
                精算メーター
              </div>
              <div class="partner-label">
                <span>${partnerBName}</span>
                <span class="partner-dot b"></span>
              </div>
            </div>

            <!-- Seesaw Bar -->
            <div class="seesaw-track">
              <div class="seesaw-center-marker" title="中央（精算完了）"></div>
              ${calc.balanceA > 0 ? `
                <div class="seesaw-fill-a" style="width: ${Math.min(50, (calc.transferAmount / (calc.totalAmount || 1)) * 100)}%;"></div>
              ` : calc.balanceB > 0 ? `
                <div class="seesaw-fill-b" style="width: ${Math.min(50, (calc.transferAmount / (calc.totalAmount || 1)) * 100)}%;"></div>
              ` : ''}
              <div class="seesaw-pin" style="left: ${calc.needlePosition}%;" title="現在のバランス"></div>
            </div>

            <div class="meter-scale-labels">
              <span>◀ ${partnerAName}が多く立替</span>
              <span style="font-weight: 600; color: #fff;">±0 (イーブン)</span>
              <span>${partnerBName}が多く立替 ▶</span>
            </div>
          </div>

          <!-- Dual Person Paid vs Expected Status -->
          <div class="dual-bars-grid">
            <div class="person-stat-box a">
              <div class="person-name-row">
                <span class="person-name">${partnerAName}</span>
                <span class="person-ratio">負担 ${defaultRatioA}%</span>
              </div>
              <div class="person-paid">¥${calc.totalPaidA.toLocaleString()}</div>
              <div class="person-expected">目標負担: ¥${calc.totalOwedA.toLocaleString()}</div>
              <div class="person-diff ${calc.balanceA >= 0 ? 'plus' : 'minus'}">
                ${calc.balanceA >= 0 ? `+¥${calc.balanceA.toLocaleString()} (立替中)` : `-¥${Math.abs(calc.balanceA).toLocaleString()} (不足)`}
              </div>
            </div>

            <div class="person-stat-box b">
              <div class="person-name-row">
                <span class="person-name">${partnerBName}</span>
                <span class="person-ratio">負担 ${defaultRatioB}%</span>
              </div>
              <div class="person-paid">¥${calc.totalPaidB.toLocaleString()}</div>
              <div class="person-expected">目標負担: ¥${calc.totalOwedB.toLocaleString()}</div>
              <div class="person-diff ${calc.balanceB >= 0 ? 'plus' : 'minus'}">
                ${calc.balanceB >= 0 ? `+¥${calc.balanceB.toLocaleString()} (立替中)` : `-¥${Math.abs(calc.balanceB).toLocaleString()} (不足)`}
              </div>
            </div>
          </div>

          <!-- Settlement CTA Buttons -->
          <div class="settlement-actions-row">
            <button class="btn-primary" id="btnShareLine">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 5.92 2 10.75c0 3.12 1.88 5.86 4.71 7.35-.21.75-.76 2.73-.87 3.14-.14.5.18.5.38.36.16-.11 2.5-1.7 3.51-2.39.73.13 1.49.2 2.27.2 5.52 0 10-3.92 10-8.75S17.52 2 12 2z"/>
              </svg>
              <span>LINEで精算を送る</span>
            </button>
            <button class="btn-secondary" id="btnSettleDone" title="精算完了にしてお祝い">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>精算完了 🎉</span>
            </button>
          </div>
        </section>

        <!-- Total Stats Summary Cards -->
        <section class="stats-summary-grid">
          <div class="summary-stat-card">
            <div class="stat-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
              <span>総支出</span>
            </div>
            <div class="stat-value">¥${calc.totalAmount.toLocaleString()}</div>
          </div>

          <div class="summary-stat-card">
            <div class="stat-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              <span>固定費</span>
            </div>
            <div class="stat-value" style="color: #a78bfa;">¥${calc.fixedAmount.toLocaleString()}</div>
          </div>

          <div class="summary-stat-card">
            <div class="stat-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
              <span>変動費</span>
            </div>
            <div class="stat-value" style="color: #38bdf8;">¥${calc.variableAmount.toLocaleString()}</div>
          </div>
        </section>

        <!-- Navigation Tabs -->
        <nav class="tabs-bar">
          <button class="tab-btn ${this.activeTab === 'all' ? 'active' : ''}" data-tab="all">
            <span>すべて</span>
            <span class="badge-count">${calc.itemCount}</span>
          </button>
          <button class="tab-btn ${this.activeTab === 'variable' ? 'active' : ''}" data-tab="variable">
            <span>変動費 (日常)</span>
          </button>
          <button class="tab-btn ${this.activeTab === 'fixed' ? 'active' : ''}" data-tab="fixed">
            <span>固定費 (定期)</span>
            <span class="badge-count">${this.fixedCosts.filter(f => f.active).length}</span>
          </button>
          <button class="tab-btn ${this.activeTab === 'charts' ? 'active' : ''}" data-tab="charts">
            <span>内訳グラフ</span>
          </button>
        </nav>

        ${this.activeTab === 'fixed' ? `
          <!-- Fixed Costs Banner -->
          <div class="fixed-cost-banner">
            <div class="fixed-cost-info">
              <div class="fixed-cost-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              </div>
              <div>
                <div style="font-weight: 700; font-size: 0.95rem;">毎月の固定費テンプレート</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">家賃や通信費など毎月自動で計算に加算されます</div>
              </div>
            </div>
            <button class="btn-secondary" id="btnAddFixedCost" style="padding: 8px 14px; font-size: 0.8rem;">
              + 固定費を追加
            </button>
          </div>
        ` : ''}

        ${this.activeTab === 'charts' ? `
          <!-- Category Breakdown Chart Section -->
          <section class="chart-card">
            <div style="font-weight: 700; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
              <span>${this.formatMonthDisplay(this.currentMonth)} カテゴリ別内訳</span>
            </div>

            ${Object.keys(calc.categoryTotals).length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <div class="empty-state-text">まだ支出データがありません</div>
              </div>
            ` : Object.entries(calc.categoryTotals)
                .sort((a, b) => b[1] - a[1])
                .map(([catKey, amount]) => {
                  const cat = CATEGORIES[catKey] || CATEGORIES.other;
                  const percent = Math.round((amount / (calc.totalAmount || 1)) * 100);
                  return `
                    <div class="category-bar-row">
                      <div class="category-bar-header">
                        <span style="display: flex; align-items: center; gap: 6px;">
                          <span>${cat.icon}</span>
                          <span>${cat.name}</span>
                        </span>
                        <span>¥${amount.toLocaleString()} <span style="font-weight: normal; color: var(--text-muted);">(${percent}%)</span></span>
                      </div>
                      <div class="category-bar-track">
                        <div class="category-bar-fill" style="width: ${percent}%; background: ${cat.color};"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
          </section>
        ` : `
          <!-- Category Filter Bar (For Expense List) -->
          <div class="category-filter-scroll">
            <button class="filter-chip ${this.selectedCategoryFilter === 'all' ? 'active' : ''}" data-cat="all">すべて</button>
            ${Object.entries(CATEGORIES).map(([key, cat]) => `
              <button class="filter-chip ${this.selectedCategoryFilter === key ? 'active' : ''}" data-cat="${key}">
                ${cat.icon} ${cat.name}
              </button>
            `).join('')}
          </div>

          <!-- Expenses List -->
          <section class="expense-list-container">
            ${displayedItems.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <div class="empty-state-text">支出データがありません</div>
                <div class="empty-state-sub">右下の「＋ 支出を記録」ボタンから食費やレシートを登録してみましょう</div>
              </div>
            ` : displayedItems.map(item => {
              const cat = CATEGORIES[item.category] || CATEGORIES.other;
              const isPayerA = item.paidBy === 'A';
              const payerName = isPayerA ? partnerAName : partnerBName;

              let splitText = '按分比率通り';
              if (item.splitType === 'half') splitText = '折半 (50:50)';
              if (item.splitType === 'fullA') splitText = `${partnerAName} 全額負担`;
              if (item.splitType === 'fullB') splitText = `${partnerBName} 全額負担`;
              if (item.splitType === 'custom') splitText = `カスタム (${item.customRatioA}%)`;

              return `
                <div class="expense-item" data-id="${item.id}" data-is-fixed="${item.isFixed}">
                  <div class="expense-left">
                    <div class="category-icon-box" style="background: ${cat.bg};">
                      <span>${cat.icon}</span>
                    </div>
                    <div class="expense-meta">
                      <div class="expense-title-row">
                        <span class="expense-title">${item.title}</span>
                        ${item.isFixed ? `<span class="fixed-badge-tag">固定費</span>` : ''}
                      </div>
                      <div class="expense-sub-row">
                        <span>${item.date.slice(5)}</span>
                        <span>•</span>
                        <span class="payer-badge ${isPayerA ? 'a' : 'b'}">${payerName} 支払</span>
                        <span>•</span>
                        <span>${splitText}</span>
                      </div>
                    </div>
                  </div>
                  <div class="expense-right">
                    <div class="expense-amount">¥${item.amount.toLocaleString()}</div>
                    <div class="expense-split-preview">
                      ${item.isFixed ? '毎月自動' : '詳細 / 削除'}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </section>
        `}
      </main>

      <!-- Floating Action Button -->
      <button class="fab-btn" id="btnOpenExpenseModal">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
        <span>支出を記録</span>
      </button>

      <!-- Toast Notification Container -->
      <div id="toastNotification" class="toast"></div>

      <!-- Modals Container -->
      <div id="modalContainer"></div>
    `;
  }

  attachEventListeners() {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    // ヘッダーアクション
    appEl.querySelector('#btnOpenSync')?.addEventListener('click', () => this.openSyncModal());
    appEl.querySelector('#btnOpenSettings')?.addEventListener('click', () => this.openSettingsModal());
    appEl.querySelector('#btnLogo')?.addEventListener('click', () => this.openSettingsModal());

    // 月送り
    appEl.querySelector('#btnPrevMonth')?.addEventListener('click', () => this.changeMonth(-1));
    appEl.querySelector('#btnNextMonth')?.addEventListener('click', () => this.changeMonth(1));
    appEl.querySelector('#btnCurrentMonth')?.addEventListener('click', () => {
      this.currentMonth = getCurrentMonthString();
      this.render();
      this.attachEventListeners();
    });

    // タブ切り替え
    appEl.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.activeTab = e.currentTarget.dataset.tab;
        this.render();
        this.attachEventListeners();
      });
    });

    // カテゴリフィルター
    appEl.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        this.selectedCategoryFilter = e.currentTarget.dataset.cat;
        this.render();
        this.attachEventListeners();
      });
    });

    // 支出追加FAB
    appEl.querySelector('#btnOpenExpenseModal')?.addEventListener('click', () => {
      this.openExpenseModal(null);
    });

    // 固定費追加
    appEl.querySelector('#btnAddFixedCost')?.addEventListener('click', () => {
      this.openFixedCostModal(null);
    });

    // LINE共有
    appEl.querySelector('#btnShareLine')?.addEventListener('click', () => {
      this.handleShareLine();
    });

    // 精算完了お祝い
    appEl.querySelector('#btnSettleDone')?.addEventListener('click', () => {
      this.handleSettleCelebration();
    });

    // アイテムタップ（詳細・編集・削除）
    appEl.querySelectorAll('.expense-item').forEach(itemEl => {
      itemEl.addEventListener('click', (e) => {
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

  // --- モーダル: 支出追加 / 編集 ---
  openExpenseModal(itemToEdit = null) {
    this.editingExpense = itemToEdit;
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
            <h3 class="modal-title">${isEdit ? '支出を編集' : '新しい支出を記録'}</h3>
            <button class="icon-btn" id="btnCloseExpenseModal">✕</button>
          </div>
          <form id="expenseForm" class="modal-body">
            <!-- 支払者選択 -->
            <div class="form-group">
              <label class="form-label">どちらが支払いましたか？</label>
              <div class="payer-toggle-group">
                <button type="button" class="payer-toggle-btn a ${initialPaidBy === 'A' ? 'selected' : ''}" id="btnPayerA">
                  <div class="payer-toggle-title">${partnerAName}</div>
                  <div class="payer-toggle-sub">が立て替えた</div>
                </button>
                <button type="button" class="payer-toggle-btn b ${initialPaidBy === 'B' ? 'selected' : ''}" id="btnPayerB">
                  <div class="payer-toggle-title">${partnerBName}</div>
                  <div class="payer-toggle-sub">が立て替えた</div>
                </button>
              </div>
              <input type="hidden" id="formPaidBy" value="${initialPaidBy}" />
            </div>

            <!-- 金額入力 -->
            <div class="form-group">
              <label class="form-label">支払金額 (円)</label>
              <input 
                type="number" 
                id="formAmount" 
                class="form-input" 
                placeholder="例: 3500" 
                style="font-size: 1.4rem; font-weight: 700; font-family: var(--font-display);"
                value="${itemToEdit ? itemToEdit.amount : ''}" 
                required 
                autofocus
              />
            </div>

            <!-- 品目・内容 -->
            <div class="form-group">
              <label class="form-label">品目・使った内容</label>
              <input 
                type="text" 
                id="formTitle" 
                class="form-input" 
                placeholder="例: スーパーで食材まとめ買い、電気代など" 
                value="${itemToEdit ? itemToEdit.title : ''}" 
                required 
              />
            </div>

            <!-- カテゴリ選択 -->
            <div class="form-group">
              <label class="form-label">カテゴリ</label>
              <div class="category-grid">
                ${Object.entries(CATEGORIES).map(([key, cat]) => `
                  <button type="button" class="category-option-btn ${initialCategory === key ? 'selected' : ''}" data-cat="${key}">
                    <span class="category-option-icon">${cat.icon}</span>
                    <span class="category-option-name">${cat.name}</span>
                  </button>
                `).join('')}
              </div>
              <input type="hidden" id="formCategory" value="${initialCategory}" />
            </div>

            <div class="form-row">
              <!-- 日付 -->
              <div class="form-group">
                <label class="form-label">日付</label>
                <input type="date" id="formDate" class="form-input" value="${itemToEdit ? itemToEdit.date : getTodayString()}" />
              </div>

              <!-- 按分比率タイプ -->
              <div class="form-group">
                <label class="form-label">負担ルール</label>
                <select id="formSplitType" class="form-select">
                  <option value="default" ${initialSplitType === 'default' ? 'selected' : ''}>基本比率 (${defaultRatioA}:${100 - defaultRatioA})</option>
                  <option value="half" ${initialSplitType === 'half' ? 'selected' : ''}>折半 (50:50)</option>
                  <option value="fullA" ${initialSplitType === 'fullA' ? 'selected' : ''}>全額 ${partnerAName} 負担</option>
                  <option value="fullB" ${initialSplitType === 'fullB' ? 'selected' : ''}>全額 ${partnerBName} 負担</option>
                  <option value="custom" ${initialSplitType === 'custom' ? 'selected' : ''}>カスタム比率指定</option>
                </select>
              </div>
            </div>

            <!-- カスタム比率スライダー（custom時のみ表示） -->
            <div id="customRatioWrapper" class="ratio-slider-container" style="display: ${initialSplitType === 'custom' ? 'block' : 'none'};">
              <div class="ratio-display-row">
                <span style="color: #60a5fa;">${partnerAName}: <span id="customRatioValA">${initialCustomRatioA}</span>%</span>
                <span style="color: #fb7185;">${partnerBName}: <span id="customRatioValB">${100 - initialCustomRatioA}</span>%</span>
              </div>
              <input type="range" id="customRatioSlider" class="custom-range-slider" min="0" max="100" step="5" value="${initialCustomRatioA}" />
            </div>

            <!-- メモ -->
            <div class="form-group">
              <label class="form-label">メモ (任意)</label>
              <input type="text" id="formMemo" class="form-input" placeholder="レシート番号や店舗名など" value="${itemToEdit?.memo || ''}" />
            </div>
          </form>

          <div class="modal-footer">
            ${isEdit ? `
              <button type="button" class="btn-secondary" id="btnDeleteExpense" style="color: #fb7185; border-color: rgba(244, 63, 94, 0.3);">
                削除
              </button>
            ` : ''}
            <button type="button" class="btn-secondary" id="btnCancelExpense">キャンセル</button>
            <button type="submit" form="expenseForm" class="btn-primary">${isEdit ? '更新する' : '登録する'}</button>
          </div>
        </div>
      </div>
    `;

    // フォーム内イベント
    const overlay = document.getElementById('expenseModalOverlay');
    const close = () => { overlay.classList.remove('open'); modalContainer.innerHTML = ''; };

    overlay.querySelector('#btnCloseExpenseModal').addEventListener('click', close);
    overlay.querySelector('#btnCancelExpense').addEventListener('click', close);

    // 支払者切り替え
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

    // カテゴリ選択
    overlay.querySelectorAll('.category-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.category-option-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        overlay.querySelector('#formCategory').value = btn.dataset.cat;
      });
    });

    // 按分セレクト
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

    // 削除
    overlay.querySelector('#btnDeleteExpense')?.addEventListener('click', async () => {
      if (confirm('この支出記録を削除してもよろしいですか？')) {
        await this.storage.deleteExpense(itemToEdit.id);
        await this.loadData();
        close();
        this.render();
        this.attachEventListeners();
        this.showToast('支出を削除しました');
      }
    });

    // 送信
    overlay.querySelector('#expenseForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = Number(overlay.querySelector('#formAmount').value);
      const title = overlay.querySelector('#formTitle').value.trim();
      const paidBy = inputPaidBy.value;
      const category = overlay.querySelector('#formCategory').value;
      const date = overlay.querySelector('#formDate').value;
      const splitType = splitSelect.value;
      const customRatioA = splitType === 'custom' ? Number(customSlider.value) : null;
      const memo = overlay.querySelector('#formMemo').value.trim();

      if (!title || !amount) return;

      const newExpense = {
        id: itemToEdit ? itemToEdit.id : `exp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        title,
        amount,
        paidBy,
        category,
        date,
        splitType,
        customRatioA,
        memo
      };

      await this.storage.saveExpense(newExpense);
      await this.loadData();
      close();
      this.render();
      this.attachEventListeners();
      this.showToast(isEdit ? '支出を更新しました！' : '支出を記録しました！');
    });
  }

  // --- モーダル: 固定費追加 / 編集 ---
  openFixedCostModal(itemToEdit = null) {
    this.editingFixedCost = itemToEdit;
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
            <h3 class="modal-title">${isEdit ? '固定費を編集' : '新しい固定費を追加'}</h3>
            <button class="icon-btn" id="btnCloseFixedModal">✕</button>
          </div>
          <form id="fixedCostForm" class="modal-body">
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: -6px;">
              家賃や光回線など、毎月自動的に生活費計算に加算される項目です。
            </div>

            <div class="form-group">
              <label class="form-label">固定費の項目名</label>
              <input type="text" id="fixedTitle" class="form-input" placeholder="例: マンション家賃、インターネット光回線" value="${itemToEdit ? itemToEdit.title : ''}" required autofocus />
            </div>

            <div class="form-group">
              <label class="form-label">月額料金 (円)</label>
              <input type="number" id="fixedAmount" class="form-input" placeholder="例: 85000" style="font-size: 1.4rem; font-weight: 700; font-family: var(--font-display);" value="${itemToEdit ? itemToEdit.amount : ''}" required />
            </div>

            <div class="form-group">
              <label class="form-label">誰の口座・カードから引き落とされますか？</label>
              <div class="payer-toggle-group">
                <button type="button" class="payer-toggle-btn a ${initialPaidBy === 'A' ? 'selected' : ''}" id="btnFixedPayerA">
                  <div class="payer-toggle-title">${partnerAName}</div>
                  <div class="payer-toggle-sub">の口座引落</div>
                </button>
                <button type="button" class="payer-toggle-btn b ${initialPaidBy === 'B' ? 'selected' : ''}" id="btnFixedPayerB">
                  <div class="payer-toggle-title">${partnerBName}</div>
                  <div class="payer-toggle-sub">の口座引落</div>
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
                  <option value="fullA" ${initialSplitType === 'fullA' ? 'selected' : ''}>全額 ${partnerAName} 負担</option>
                  <option value="fullB" ${initialSplitType === 'fullB' ? 'selected' : ''}>全額 ${partnerBName} 負担</option>
                </select>
              </div>
            </div>
          </form>

          <div class="modal-footer">
            ${isEdit ? `
              <button type="button" class="btn-secondary" id="btnDeleteFixedCost" style="color: #fb7185; border-color: rgba(244, 63, 94, 0.3);">
                削除
              </button>
            ` : ''}
            <button type="button" class="btn-secondary" id="btnCancelFixed">キャンセル</button>
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
      if (confirm('この固定費を削除してもよろしいですか？')) {
        await this.storage.deleteFixedCost(itemToEdit.id);
        await this.loadData();
        close();
        this.render();
        this.attachEventListeners();
        this.showToast('固定費を削除しました');
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
      this.showToast(isEdit ? '固定費を更新しました！' : '固定費を追加しました！');
    });
  }

  // --- モーダル: 設定・按分比率変更 ---
  openSettingsModal() {
    const { partnerAName, partnerBName, defaultRatioA } = this.settings;
    const modalContainer = document.getElementById('modalContainer');

    modalContainer.innerHTML = `
      <div class="modal-overlay open" id="settingsModalOverlay">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">アプリ設定 ＆ 按分比率</h3>
            <button class="icon-btn" id="btnCloseSettingsModal">✕</button>
          </div>
          <div class="modal-body">
            <!-- 2人の名前設定 -->
            <div class="form-group">
              <label class="form-label">2人の呼び名</label>
              <div class="form-row">
                <input type="text" id="settingNameA" class="form-input" value="${partnerAName}" placeholder="パートナーA (例: たろう)" />
                <input type="text" id="settingNameB" class="form-input" value="${partnerBName}" placeholder="パートナーB (例: はなこ)" />
              </div>
            </div>

            <!-- 基本按分比率スライダー -->
            <div class="form-group">
              <label class="form-label">基本の負担比率</label>
              <div class="ratio-slider-container">
                <div class="ratio-display-row">
                  <span style="color: #60a5fa;">${partnerAName}: <span id="settingRatioValA">${defaultRatioA}</span>%</span>
                  <span style="color: #fb7185;">${partnerBName}: <span id="settingRatioValB">${100 - defaultRatioA}</span>%</span>
                </div>
                <input type="range" id="settingRatioSlider" class="custom-range-slider" min="0" max="100" step="5" value="${defaultRatioA}" />
                <div class="ratio-pills">
                  <button type="button" class="ratio-pill ${defaultRatioA === 50 ? 'active' : ''}" data-val="50">50 : 50 (完全折半)</button>
                  <button type="button" class="ratio-pill ${defaultRatioA === 60 ? 'active' : ''}" data-val="60">60 : 40</button>
                  <button type="button" class="ratio-pill ${defaultRatioA === 70 ? 'active' : ''}" data-val="70">70 : 30</button>
                </div>
              </div>
            </div>

            <!-- 便利アクション -->
            <div class="form-group" style="padding-top: 10px; border-top: 1px solid var(--border-subtle);">
              <label class="form-label">データ管理</label>
              <div style="display: flex; gap: 8px;">
                <button type="button" class="btn-secondary" id="btnLoadDemo" style="flex: 1; font-size: 0.8rem;">
                  サンプルデータを再投入
                </button>
                <button type="button" class="btn-secondary" id="btnClearAll" style="font-size: 0.8rem; color: #fb7185;">
                  データを初期化
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="btnCancelSettings">閉じる</button>
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
      overlay.querySelectorAll('.ratio-pill').forEach(p => {
        p.classList.toggle('active', parseInt(p.dataset.val, 10) === v);
      });
    });

    overlay.querySelectorAll('.ratio-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const v = parseInt(pill.dataset.val, 10);
        slider.value = v;
        valA.textContent = v;
        valB.textContent = 100 - v;
        overlay.querySelectorAll('.ratio-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });

    // デモデータ再投入
    overlay.querySelector('#btnLoadDemo').addEventListener('click', async () => {
      if (confirm('サンプル支出データを投入しますか？')) {
        await this.storage.loadDemoData(this.currentMonth);
        await this.loadData();
        close();
        this.render();
        this.attachEventListeners();
        this.showToast('サンプルデータを投入しました！');
      }
    });

    // 全初期化
    overlay.querySelector('#btnClearAll').addEventListener('click', async () => {
      if (confirm('すべての支出と固定費データを削除して初期化しますか？')) {
        await this.storage.clearAll();
        await this.loadData();
        close();
        this.render();
        this.attachEventListeners();
        this.showToast('データを初期化しました');
      }
    });

    // 保存
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
      this.showToast('設定を保存しました！');
    });
  }

  // --- モーダル: クラウド同期 (Supabase) 設定 ---
  openSyncModal() {
    const cfg = this.storage.getSupabaseConfig();
    const isConnected = this.storage.isConnected;
    const modalContainer = document.getElementById('modalContainer');

    modalContainer.innerHTML = `
      <div class="modal-overlay open" id="syncModalOverlay">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">☁️ 2人のリアルタイム同期 (Supabase)</h3>
            <button class="icon-btn" id="btnCloseSyncModal">✕</button>
          </div>
          <div class="modal-body">
            <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
              無料のSupabaseと接続すると、<strong>2人のスマホからリアルタイムに生活費が同期</strong>され、片方が入力した瞬間に相手のメーターが動くようになります！
            </div>

            <div style="background: ${isConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)'}; border: 1px solid ${isConnected ? 'var(--accent-green)' : 'var(--accent-gold)'}; border-radius: var(--radius-md); padding: 12px 14px; display: flex; align-items: center; gap: 10px;">
              <span class="sync-dot ${isConnected ? 'connected' : 'local'}"></span>
              <div style="font-size: 0.85rem; font-weight: 600;">
                ${isConnected ? '現在クラウドデータベースと正常に接続されています 🟢' : '現在ブラウザのローカル保存モードで動作中 🟡'}
              </div>
            </div>

            <!-- Supabase URL & Key -->
            <div class="form-group">
              <label class="form-label">Supabase Project URL</label>
              <input type="text" id="syncUrl" class="form-input" placeholder="https://xxxxxxxx.supabase.co" value="${cfg.url || ''}" />
            </div>

            <div class="form-group">
              <label class="form-label">Supabase Anon Key (API Key)</label>
              <input type="password" id="syncKey" class="form-input" placeholder="eyJhbGciOiJIUzI1NiIsInR5..." value="${cfg.key || ''}" />
            </div>

            <!-- セットアップ手順折りたたみ -->
            <details style="background: rgba(15, 23, 42, 0.5); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px 14px; font-size: 0.8rem;">
              <summary style="cursor: pointer; font-weight: 700; color: #38bdf8;">
                📖 初めての方へ：Supabaseのテーブル作成SQL（1分で完了）
              </summary>
              <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
                <p>1. <a href="https://supabase.com/" target="_blank" style="color: #60a5fa; text-decoration: underline;">supabase.com</a> で無料プロジェクトを作成</p>
                <p>2. 左メニューの「SQL Editor」を開き、以下のSQLを貼り付けて「Run」を実行:</p>
                <div class="code-box">
                  <button class="copy-btn" id="btnCopySql">SQLをコピー</button>
                  <pre>${SUPABASE_SETUP_SQL}</pre>
                </div>
                <p>3. 「Project Settings」→「API」から「Project URL」と「anon public key」を上記に入力して保存すれば完了です！</p>
              </div>
            </details>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="btnCancelSync">キャンセル</button>
            <button type="button" class="btn-primary" id="btnSaveSync">接続して保存</button>
          </div>
        </div>
      </div>
    `;

    const overlay = document.getElementById('syncModalOverlay');
    const close = () => { overlay.classList.remove('open'); modalContainer.innerHTML = ''; };

    overlay.querySelector('#btnCloseSyncModal').addEventListener('click', close);
    overlay.querySelector('#btnCancelSync').addEventListener('click', close);

    // SQLコピー
    overlay.querySelector('#btnCopySql')?.addEventListener('click', () => {
      navigator.clipboard.writeText(SUPABASE_SETUP_SQL).then(() => {
        this.showToast('SQLをクリップボードにコピーしました！');
      });
    });

    // 保存＆接続テスト
    overlay.querySelector('#btnSaveSync').addEventListener('click', async () => {
      const url = overlay.querySelector('#syncUrl').value.trim();
      const key = overlay.querySelector('#syncKey').value.trim();

      const success = await this.storage.saveSupabaseConfig(url, key);
      await this.loadData();
      close();
      this.render();
      this.attachEventListeners();

      if (success) {
        this.showToast('Supabaseクラウドに接続しました！🎉');
      } else if (!url && !key) {
        this.showToast('ローカル保存モードに戻しました');
      } else {
        this.showToast('接続に失敗しました。URLとAPIキーを確認してください');
      }
    });
  }

  // LINE精算テキスト生成・共有
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

    // LINE URLスキーム（スマホの場合はLINEアプリが開く、PCならWeb）
    const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
    
    // クリップボードにもコピー
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast('精算メッセージをコピーしました！LINEを開きます');
        setTimeout(() => {
          window.open(lineUrl, '_blank');
        }, 400);
      }).catch(() => {
        window.open(lineUrl, '_blank');
      });
    } else {
      window.open(lineUrl, '_blank');
    }
  }

  // 精算完了時のお祝い演出
  handleSettleCelebration() {
    // 画面いっぱいにカラフルな紙吹雪を飛ばす
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0 }
      });
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1 }
      });
    }, 250);

    this.showToast('🎉 今月の精算お疲れ様でした！');
  }
}

// アプリ起動
window.addEventListener('DOMContentLoaded', () => {
  new PairPayApp();
});
