// netlify/functions/izipay-token.js
// Generates a formToken from Izipay REST API
// Called by the frontend — secret key stays on server

const CORS = {
  'Access-Control-Allow-Origin': 'https://predictx-app.netlify.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Simple in-memory rate limiter
const rateLimiter = {};
const RATE_LIMIT  = 10;     // max 10 token requests per window per IP
const RATE_WINDOW = 60000;  // 1 minute

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };

  // Rate limiting by IP
  const ip  = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  if (!rateLimiter[ip]) rateLimiter[ip] = { count: 0, reset: now + RATE_WINDOW };
  if (now > rateLimiter[ip].reset) rateLimiter[ip] = { count: 0, reset: now + RATE_WINDOW };
  rateLimiter[ip].count++;
  if (rateLimiter[ip].count > RATE_LIMIT) {
    return { statusCode: 429, headers: { ...CORS, 'Content-Type': 'application/json', 'Retry-After': '60' },
      body: JSON.stringify({ error: 'Demasiadas solicitudes. Intenta en 1 minuto.' }) };
  }

  const MODE    = process.env.IZIPAY_MODE || 'test';
  const SHOP_ID = process.env.IZIPAY_SHOP_ID;
  const SECRET  = MODE === 'prod' ? process.env.IZIPAY_PROD_KEY : process.env.IZIPAY_TEST_KEY;

  if (!SHOP_ID || !SECRET) {
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Izipay no configurado. Revisa las variables de entorno en Netlify.' }) };
  }

  const API_URL = 'https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment';

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { amount, currency = 'PEN', email, orderId } = body;
  const parsedAmount = parseFloat(amount);
  if (!parsedAmount || isNaN(parsedAmount) || parsedAmount < 1 || parsedAmount > 50000) {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Monto inválido (1–50000)' }) };
  }

  // Validate email format loosely
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Email inválido' }) };
  }

  const amountInCents = Math.round(parsedAmount * 100);

  const payload = {
    amount: amountInCents,
    currency,
    orderId: orderId || ('PX-' + Date.now()),
    customer: { email: email || 'cliente@predictx.com' },
  };

  const credentials = Buffer.from(`${SHOP_ID}:${SECRET}`).toString('base64');

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (data.status !== 'SUCCESS') {
      return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: data.answer?.errorMessage || 'Error Izipay' }) };
    }

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ formToken: data.answer.formToken, mode: MODE, shopId: SHOP_ID }) };

  } catch (err) {
    return { statusCode: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Error de red: ' + err.message }) };
  }
};
