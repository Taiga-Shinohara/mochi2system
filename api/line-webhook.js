// メモリ内に直近のグループIDをキャッシュ（Serverlessインスタンス間での簡易受渡用）
let lastDetectedInfo = {
  groupId: '',
  sourceType: '',
  detectedAt: null
};

export default async function handler(req, res) {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GETリクエスト: フロントエンドからの最新グループID問い合わせ
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'active',
      lastDetected: lastDetectedInfo
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { events } = req.body || {};

    // LINE Developersの「検証（Verify）」ボタン対応（空配列で200を返す）
    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(200).json({ status: 'ok', message: 'Verification successful' });
    }

    for (const ev of events) {
      const source = ev.source || {};
      const targetId = source.groupId || source.roomId || source.userId || '';
      const sourceType = source.type || 'unknown';

      if (targetId) {
        lastDetectedInfo = {
          groupId: targetId,
          sourceType,
          detectedAt: new Date().toISOString()
        };
      }

      // Botがグループに追加された時、または「ID」や「グループID」と発言された時
      const isJoinEvent = ev.type === 'join' || ev.type === 'memberJoined';
      const isIdMessage = ev.type === 'message' && ev.message?.type === 'text' && 
        (ev.message.text.includes('ID') || ev.message.text.includes('id') || ev.message.text.includes('もちもち') || ev.message.text.includes('連携'));

      // 自動返信（Channel Access Tokenが環境変数にある場合、グループチャットにIDを即座に通知）
      const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (token && ev.replyToken && (isJoinEvent || isIdMessage || ev.type === 'message')) {
        try {
          await fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              replyToken: ev.replyToken,
              messages: [
                {
                  type: 'text',
                  text: `🐾 もちもち犬です！\n\nこのトークルームの送信先IDは以下です：\n${targetId}\n\nアプリの「設定 ＞ 送信先ID」に貼り付けて保存してくださいね！`
                }
              ]
            })
          });
        } catch (replyErr) {
          console.warn('Failed to reply to LINE group', replyErr);
        }
      }
    }

    return res.status(200).json({ status: 'ok', detected: lastDetectedInfo });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}
