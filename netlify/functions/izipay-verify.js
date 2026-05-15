// netlify/functions/izipay-verify.js
// Verifies the payment result hash from Izipay (prevents fake confirmations)

const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin': 'https://predictx-app.netlify.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };

  const MODE   = process.env.IZIPAY_MODE || 'test';
  const SECRET = MODE === 'prod' ? process.env.IZIPAY_PROD_KEY : process.env.IZIPAY_TEST_KEY;

  if (!SECRET) {
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Izipay no configurado.' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { kr_answer, kr_hash, kr_hash_algorithm } = body;

  if (!kr_answer || !kr_hash) {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing kr_answer or kr_hash' }) };
  }

  // SEC: Use timingSafeEqual to prevent timing attacks on HMAC comparison
  const algo = (kr_hash_algorithm || 'sha256').replace('hmac_', '');
  const computed = crypto.createHmac(algo, SECRET).update(kr_answer).digest('hex');

  let hashMatch = false;
  try {
    hashMatch = crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(kr_hash,  'hex')
    );
  } catch(_) {
    // Buffer length mismatch — definitely not equal
    hashMatch = false;
  }

  if (!hashMatch) {
    console.error('HMAC mismatch — possible tampered response');
    return { statusCode: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Firma inválida — pago no verificado' }) };
  }

  let answer;
  try { answer = JSON.parse(kr_answer); } catch(e) {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'kr_answer parse error' }) };
  }

  const transaction = answer.transactions?.[0];
  const status      = transaction?.detailedStatus || answer.orderStatus;
  const paid        = status === 'AUTHORISED' || status === 'CAPTURED' || answer.orderStatus === 'PAID';
  const amount      = transaction?.amount || answer.orderDetails?.orderTotalAmount;
  const currency    = transaction?.currency || answer.orderDetails?.orderCurrency;
  const orderId     = answer.orderDetails?.orderId;

  return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paid, status, amount, currency, orderId, email: answer.customer?.email }) };
};
