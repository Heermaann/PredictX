// api/pay-winner.js — Pay bet winner using service key (bypasses RLS)
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers['x-admin-token'];
  if (token !== 'predictx-admin-sync') return res.status(401).json({error:'Unauthorized'});

  const { email, amount, pick, match } = req.body || {};
  if (!email || !amount || +amount <= 0) return res.status(400).json({error:'Invalid params'});

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ghgkvtdhuqfpigbtzefz.supabase.co';
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({error:'No service key configured'});

  const h = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    const base = SUPABASE_URL + '/rest/v1';

    // Read current balance
    const profResp = await fetch(`${base}/profiles?select=balance&email=eq.${encodeURIComponent(email)}`, { headers: h });
    const profData = await profResp.json();
    const currentBalance = +(profData[0]?.balance || 0);
    const newBalance = +(currentBalance + +amount).toFixed(2);

    // Update balance
    await fetch(`${base}/profiles?email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH', headers: {...h, 'Prefer':'return=minimal'},
      body: JSON.stringify({ balance: newBalance })
    });

    // Insert win transaction
    await fetch(`${base}/transactions`, {
      method: 'POST', headers: {...h, 'Prefer':'return=minimal'},
      body: JSON.stringify({
        user_email: email,
        description: `Premio: ${pick} (${match})`,
        type: 'win',
        amount: +amount,
        balance: newBalance,
        created_at: new Date().toISOString()
      })
    });

    return res.status(200).json({ ok: true, newBalance });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
