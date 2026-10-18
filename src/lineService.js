/**
 * LINE Messaging API 連携サービス
 * 支出記録時の自動通知 ＆ 指定日の精算リマインド
 */

export class LineService {
  constructor(getSettings) {
    this.getSettings = getSettings;
  }

  getConfig() {
    const s = this.getSettings ? this.getSettings() : {};
    return {
      token: s.lineToken || '',
      to: s.lineTo || '', // Group ID (c...) or User ID (U...)
      reminderDay: s.reminderDay || 25,
      autoNotify: s.lineAutoNotify !== false,
      appUrl: s.appUrl || ''
    };
  }

  isConfigured() {
    const { token, to } = this.getConfig();
    return Boolean(token && to);
  }

  /**
   * もちもち生活費アプリのアクセスURLを取得
   */
  getAppUrl(settings) {
    const s = settings || (this.getSettings ? this.getSettings() : {});
    if (s.appUrl && s.appUrl.trim()) {
      return s.appUrl.trim();
    }
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      const cleanUrl = window.location.origin + window.location.pathname;
      return cleanUrl.replace(/\/$/, '');
    }
    return '';
  }

  /**
   * LINE通知末尾に付与するURLフッター
   */
  formatUrlFooter(settings) {
    const url = this.getAppUrl(settings);
    if (!url) return '';
    return `\n\n👇 もちもち生活費を開く：\n${url}`;
  }

  /**
   * LINE Bot経由でメッセージを送信
   * (ブラウザからのCORS制限回避のため、直接FetchまたはServerless / プロキシ対応)
   */
  async sendMessage(text) {
    const { token, to } = this.getConfig();
    if (!token || !to) return false;

    // メッセージ内にURLが含まれていない場合の自動追記（漏れ防止ガード）
    let fullText = text;
    const appUrl = this.getAppUrl();
    if (appUrl && !fullText.includes(appUrl) && !fullText.includes('http://') && !fullText.includes('https://')) {
      fullText = `${fullText}\n\n👇 もちもち生活費を開く：\n${appUrl}`;
    }

    try {
      // Vercel Serverless Function経由 または 直接リクエスト
      const res = await fetch('/api/line-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, to, text: fullText })
      });

      if (!res.ok) {
        // フォールバック: 直接送信（CORSヘッダーが通る場合）
        const directRes = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            to,
            messages: [{ type: 'text', text: fullText }]
          })
        });
        return directRes.ok;
      }
      return true;
    } catch (err) {
      console.warn('LINE notify failed (likely CORS or network)', err);
      return false;
    }
  }

  /**
   * 支出登録時の自動通知
   */
  async notifyExpenseAdded(expense, calc, settings) {
    const { autoNotify } = this.getConfig();
    if (!this.isConfigured() || !autoNotify) return;

    const payer = expense.paidBy === 'A' ? settings.partnerAName : settings.partnerBName;
    const footer = this.formatUrlFooter(settings);

    const text = `🐾 もちもち生活費に記録されました

【内容】${expense.title}
【金額】¥${Number(expense.amount).toLocaleString()}
【支払】${payer}
【日付】${expense.date}

現在の精算：
${calc.status === 'even' ? '🎉 ピッタリ（イーブン）です' : `👉 ${calc.payerName} → ${calc.receiverName} へ ¥${calc.transferAmount.toLocaleString()}`}${footer}`;

    await this.sendMessage(text);
  }

  /**
   * 固定費登録時の自動通知
   */
  async notifyFixedCostAdded(fixedCost, calc, settings) {
    const { autoNotify } = this.getConfig();
    if (!this.isConfigured() || !autoNotify) return;

    const payer = fixedCost.paidBy === 'A' ? settings.partnerAName : settings.partnerBName;
    const [y, m] = (fixedCost.startMonth || '2026-01').split('-');
    const startMonthStr = `${y}年${parseInt(m, 10)}月`;
    const footer = this.formatUrlFooter(settings);

    const text = `🔄 もちもち生活費に【固定費】が登録されました

【項目】${fixedCost.title}
【月額】¥${Number(fixedCost.amount).toLocaleString()}
【担当】${payer} (口座/カード)
【開始月】${startMonthStr}以降 毎月自動

現在の精算目安：
${calc.status === 'even' ? '🎉 ピッタリ（イーブン）です' : `👉 ${calc.payerName} → ${calc.receiverName} へ ¥${calc.transferAmount.toLocaleString()}`}${footer}`;

    await this.sendMessage(text);
  }

  /**
   * 精算リマインドメッセージ
   */
  async sendSettlementReminder(calc, settings, monthLabel) {
    if (!this.isConfigured()) return false;
    const footer = this.formatUrlFooter(settings);

    const text = `🐾 もちもち犬よりお知らせ

もうすぐ清算します。まだ記録していないのはわかっていますよ。

📅 対象月: ${monthLabel}
💰 今月の総支出: ¥${calc.totalAmount.toLocaleString()}
${calc.status === 'even' ? '✨ 現在はイーブン（精算なし）です' : `👉 ${calc.payerName} から ${calc.receiverName} へ ¥${calc.transferAmount.toLocaleString()}`}

アプリを開いて、今月使ったレシートや支出の記録を完了してくださいね。${footer}`;

    return await this.sendMessage(text);
  }
}
