import { createWorker } from 'tesseract.js';

export class OcrService {
  /**
   * レシート・領収書画像からテキストを抽出し、金額・日付・店名・カテゴリを解析する
   * @param {File | Blob} imageFile
   * @param {function} onProgress
   */
  static async scanReceipt(imageFile, onProgress = () => {}) {
    onProgress('もちもち文字を読み取り中...');
    
    // Tesseractワーカー起動（日本語＋英語）
    const worker = await createWorker('jpn+eng');
    
    try {
      const ret = await worker.recognize(imageFile);
      const text = ret.data.text;
      await worker.terminate();

      return this.parseReceiptText(text);
    } catch (err) {
      await worker.terminate();
      throw err;
    }
  }

  /**
   * 抽出されたテキストからキー情報を自動解析
   */
  static parseReceiptText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    let amount = null;
    let date = null;
    let title = '';
    let category = 'food';

    // 1. 金額の抽出
    // 「合計」「お買上」「領収金額」「計」「小計」の近くにある数値を優先
    const totalRegex = /(合計|買上|支払|領収金額|合\s*計|小\s*計|税込)[^\d¥]*[¥￥]?\s*([\d,]+)/i;
    for (const line of lines) {
      const match = line.match(totalRegex);
      if (match) {
        const parsed = parseInt(match[2].replace(/,/g, ''), 10);
        if (parsed > 0 && parsed < 2000000) {
          amount = parsed;
          break;
        }
      }
    }

    // もし上記で見つからなければ、¥マークがついた金額または最も大きな数値を探索
    if (!amount) {
      const yenMatches = text.match(/[¥￥]\s*([\d,]+)/g);
      if (yenMatches) {
        const amounts = yenMatches
          .map(m => parseInt(m.replace(/[¥￥,\s]/g, ''), 10))
          .filter(a => a > 0 && a < 2000000);
        if (amounts.length > 0) {
          amount = Math.max(...amounts);
        }
      }
    }

    // それでもなければ文中の3桁〜7桁の数値をチェック
    if (!amount) {
      const allNumbers = text.match(/\b\d{3,6}\b/g);
      if (allNumbers) {
        const candidates = allNumbers.map(n => parseInt(n, 10)).filter(n => n >= 100 && n <= 500000);
        if (candidates.length > 0) {
          amount = candidates[candidates.length - 1]; // レシート下部の合計値
        }
      }
    }

    // 2. 日付の抽出 (YYYY/MM/DD, YYYY-MM-DD, YYYY年MM月DD日, 令和X年)
    const dateRegex = /(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})/;
    const reiwaRegex = /令和\s*(\d{1,2})[年/.-](\d{1,2})[月/.-](\d{1,2})/;

    for (const line of lines) {
      const dMatch = line.match(dateRegex);
      if (dMatch) {
        const y = dMatch[1];
        const m = String(dMatch[2]).padStart(2, '0');
        const d = String(dMatch[3]).padStart(2, '0');
        date = `${y}-${m}-${d}`;
        break;
      }
      const rMatch = line.match(reiwaRegex);
      if (rMatch) {
        const y = 2018 + parseInt(rMatch[1], 10);
        const m = String(rMatch[2]).padStart(2, '0');
        const d = String(rMatch[3]).padStart(2, '0');
        date = `${y}-${m}-${d}`;
        break;
      }
    }

    // 3. 店名・品目の推定
    // レシートの最初に出てくる店舗らしい文字列（最初の2〜3行）
    if (lines.length > 0) {
      // 電話番号やレジ番号、記号だけの行を避ける
      for (let i = 0; i < Math.min(5, lines.length); i++) {
        const l = lines[i];
        if (l.length >= 2 && !l.startsWith('TEL') && !l.startsWith('No') && !l.match(/^[0-9\-\s]+$/)) {
          title = l.slice(0, 25);
          break;
        }
      }
    }
    if (!title) title = 'レシートの買い物';

    // 4. カテゴリの自動判定
    const lowerText = text.toLowerCase();
    if (lowerText.includes('電気') || lowerText.includes('ガス') || lowerText.includes('水道') || lowerText.includes('電力') || lowerText.includes('エネルギー')) {
      category = 'utilities';
    } else if (lowerText.includes('薬局') || lowerText.includes('ドラッグ') || lowerText.includes('マツモトキヨシ') || lowerText.includes('ウエルシア') || lowerText.includes('日用品') || lowerText.includes('無印良品')) {
      category = 'daily';
    } else if (lowerText.includes('レストラン') || lowerText.includes('カフェ') || lowerText.includes('居酒屋') || lowerText.includes('食堂') || lowerText.includes('ラーメン') || lowerText.includes('焼肉') || lowerText.includes('スタバ') || lowerText.includes('喫茶')) {
      category = 'dining';
    } else if (lowerText.includes('wifi') || lowerText.includes('通信') || lowerText.includes('インターネット') || lowerText.includes('ドコモ') || lowerText.includes('softbank') || lowerText.includes('au')) {
      category = 'wifi';
    } else if (lowerText.includes('映画') || lowerText.includes('レジャー') || lowerText.includes('チケット') || lowerText.includes('アミューズメント')) {
      category = 'entertainment';
    } else {
      category = 'food'; // デフォルトは食費
    }

    return {
      rawText: text,
      amount,
      date,
      title,
      category
    };
  }
}
