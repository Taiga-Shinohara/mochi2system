import crypto from 'crypto';

// メモリ内キャッシュ（Serverlessインスタンス生存中の高速アクセス用）
const memoryCache = new Map();

// パスコードからAES-256暗号化キーを導出
function deriveKey(passcode) {
  return crypto.createHash('sha256').update(String(passcode).trim()).digest();
}

// 暗号化
function encrypt(text, passcode) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', deriveKey(passcode), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// 復号
function decrypt(encryptedText, passcode) {
  const parts = encryptedText.split(':');
  if (parts.length !== 2) return null;
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', deriveKey(passcode), iv);
  let decrypted = decipher.update(parts[1], 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// 外部分散KVストア (kvdb.io) への保存・取得ヘルパー
// 公開KVには暗号化文字列のみを保存するため、安全性が保たれます
const KV_BUCKET = 'mochi_pairpay_sync_v1';

async function saveToKv(hashedKey, encryptedPayload) {
  try {
    const res = await fetch(`https://kvdb.io/${KV_BUCKET}/${hashedKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: encryptedPayload
    });
    return res.ok;
  } catch (err) {
    console.warn('kvdb save error:', err);
    return false;
  }
}

async function getFromKv(hashedKey) {
  try {
    const res = await fetch(`https://kvdb.io/${KV_BUCKET}/${hashedKey}`);
    if (res.ok) {
      return await res.text();
    }
  } catch (err) {
    console.warn('kvdb get error:', err);
  }
  return null;
}

export default async function handler(req, res) {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. 合言葉の照合・設定取得 (GET)
  if (req.method === 'GET') {
    const passcode = String(req.query.passcode || '').trim();
    if (!passcode) {
      return res.status(400).json({ success: false, error: '合言葉を入力してください' });
    }

    const hashedKey = crypto.createHash('sha256').update(passcode.toLowerCase()).digest('hex');

    // キャッシュまたは外部KVから取得
    let encryptedData = memoryCache.get(hashedKey);
    if (!encryptedData) {
      encryptedData = await getFromKv(hashedKey);
    }

    if (!encryptedData) {
      // Vercel環境変数のデフォルト合言葉チェック（設定されている場合）
      const defaultPasscode = process.env.SYNC_PASSCODE || 'たいがあいり';
      const envUrl = process.env.SUPABASE_URL;
      const envKey = process.env.SUPABASE_ANON_KEY;

      if (envUrl && envKey && passcode.toLowerCase() === defaultPasscode.toLowerCase()) {
        return res.status(200).json({
          success: true,
          config: { url: envUrl, key: envKey }
        });
      }

      return res.status(404).json({
        success: false,
        error: 'この合言葉は登録されていないか、期限切れです。\n同期中の端末で合言葉を再登録してください。'
      });
    }

    try {
      const decrypted = decrypt(encryptedData, passcode);
      if (!decrypted) throw new Error('Decryption failed');
      const config = JSON.parse(decrypted);

      if (!config.url || !config.key) {
        throw new Error('Invalid config inside payload');
      }

      return res.status(200).json({
        success: true,
        config: { url: config.url, key: config.key }
      });
    } catch (err) {
      console.error('Passcode decrypt error:', err);
      return res.status(400).json({
        success: false,
        error: '合言葉が一致しないか、データの復号に失敗しました'
      });
    }
  }

  // 2. 合言葉の登録 (POST)
  if (req.method === 'POST') {
    const { passcode, config } = req.body || {};
    const cleanPasscode = String(passcode || '').trim();

    if (!cleanPasscode) {
      return res.status(400).json({ success: false, error: '合言葉を入力してください' });
    }
    if (!config || !config.url || !config.key) {
      return res.status(400).json({ success: false, error: '同期設定（URLとKey）が不足しています' });
    }

    const hashedKey = crypto.createHash('sha256').update(cleanPasscode.toLowerCase()).digest('hex');
    const encryptedPayload = encrypt(JSON.stringify({ url: config.url, key: config.key }), cleanPasscode);

    // メモリキャッシュに保存
    memoryCache.set(hashedKey, encryptedPayload);

    // 外部KVにも永続化
    await saveToKv(hashedKey, encryptedPayload);

    return res.status(200).json({
      success: true,
      message: `合言葉「${cleanPasscode}」を登録しました！パートナーの端末でこの合言葉を入力すると同期されます🐾`
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
