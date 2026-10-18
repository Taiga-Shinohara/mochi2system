export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, to, text } = req.body || {};
  if (!token || !to || !text) {
    return res.status(400).json({ error: 'Missing token, to, or text' });
  }

  try {
    const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        to,
        messages: [{ type: 'text', text }]
      })
    });

    const data = await lineResponse.json().catch(() => ({}));
    if (!lineResponse.ok) {
      return res.status(lineResponse.status).json({ error: 'LINE API error', details: data });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
