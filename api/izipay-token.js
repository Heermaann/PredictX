// api/izipay-token.js — Vercel serverless function
const rateLimiter = {};
const RATE_LIMIT = 10;
const RATE_WINDOW = 60000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  if (!rateLimiter[ip]) rateLimiter[ip] = { count: 0, reset: now + RATE_WINDOW };
  if (now > rateLimiter[ip].reset) rateLimiter[ip] = { count: 0, reset: now + RATE_WINDOW };
  rateLimiter[ip].count++;
  if (rateLimiter[ip].count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en 1 minuto.' });
  }

  const MODE      = process.env.IZIPAY_MODE || 'test';
  const SHOP_ID   = process.env.IZIPAY_SHOP_ID;
  const REST_SECRET = MODE === 'prod' ? process.env.IZIPAY_PROD_KEY : process.env.IZIPAY_TEST_KEY;
  const PUB_KEY   = MODE === 'prod' ? process.env.IZIPAY_PUB_PROD_KEY : process.env.IZIPAY_PUB_TEST_KEY;

  if (!SHOP_ID || !REST_SECRET || !PUB_KEY) {
    return res.status(500).json({ error: 'Izipay no configurado. Revisa las variables de entorno.' });
  }

  const body = req.body;
  const { amount, currency = 'PEN', email, orderId } = body;
  const parsedAmount = parseFloat(amount);
  if (!parsedAmount || isNaN(parsedAmount) || parsedAmount < 1 || parsedAmount > 50000) {
    return res.status(400).json({ error: 'Monto inválido (1–50000 soles)' });
  }

  const amountInCents = Math.round(parsedAmount * 100);
  const payload = {
    amount: amountInCents, currency,
    orderId: orderId || ('PX-' + Date.now()),
    customer: { email: email || 'cliente@predictx.com' },
  };

  const credentials = Buffer.from(`${SHOP_ID}:${REST_SECRET}`).toString('base64');

  try {
    const resp = await fetch('https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (data.status !== 'SUCCESS') {
      return res.status(400).json({ error: data.answer?.errorMessage || 'Error al crear el token' });
    }
    return res.status(200).json({ formToken: data.answer.formToken, publicKey: PUB_KEY, mode: MODE, shopId: SHOP_ID });
  } catch(err) {
    return res.status(502).json({ error: 'Error de red: ' + err.message });
  }
}
