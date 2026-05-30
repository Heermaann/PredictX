// /api/pay-winner.js — Serverless function to pay bet winners
// Uses service key to bypass RLS

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const token = req.headers['x-admin-token'];
  if (token !== 'predictx-admin-sync') return res.status(401).json({error:'Unauthorized'});

  const { email, amount, pick, match } = req.body || {};
  if (!email || !amount || amount <= 0) return res.status(400).json({error:'Invalid params'});

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ghgkvtdhuqfpigbtzefz.supabase.co';
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({error:'No service key'});

  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    // Read current balance
    const profResp = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=balance&email=eq.${encodeURIComponent(email)}`,
      { headers }
    );
    const profData = await profResp.json();
    const currentBalance = +(profData[0]?.balance || 0);
    const newBalance = +(currentBalance + amount).toFixed(2);

    // Update balance
    await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`,
      { method: 'PATCH', headers: {...headers,'Prefer':'return=minimal'}, body: JSON.stringify({balance: newBalance}) }
    );

    // Insert transaction
    await fetch(
      `${SUPABASE_URL}/rest/v1/transactions`,
      { method: 'POST', headers: {...headers,'Prefer':'return=minimal'}, body: JSON.stringify({
        user_email: email,
        description: `Premio: ${pick} (${match})`,
        type: 'win',
        amount: amount,
        balance: newBalance,
        created_at: new Date().toISOString()
      })}
    );

    return res.status(200).json({ok:true, newBalance});
  } catch(err) {
    return res.status(500).json({error: err.message});
  }
}
