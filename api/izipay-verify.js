// api/izipay-verify.js — Vercel serverless function
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const MODE     = process.env.IZIPAY_MODE || 'test';
  const HMAC_KEY = MODE === 'prod' ? process.env.IZIPAY_HMAC_PROD : process.env.IZIPAY_HMAC_TEST;

  if (!HMAC_KEY) return res.status(500).json({ error: 'HMAC key no configurada.' });

  const { kr_answer, kr_hash } = req.body;

  if (!kr_answer || !kr_hash) {
    return res.status(400).json({ error: 'Faltan kr_answer o kr_hash' });
  }

  // SEC: Limit payload size to prevent DoS
  if (typeof kr_answer !== 'string' || kr_answer.length > 100000) {
    return res.status(400).json({ error: 'Payload inválido' });
  }

  // SEC: Whitelist algorithm — only sha256, ignore client-supplied algorithm
  // (prevents algorithm injection attacks)
  const algo     = 'sha256';
  const computed = crypto.createHmac(algo, HMAC_KEY).update(kr_answer).digest('hex');

  // SEC: Use timingSafeEqual to prevent timing attacks
  let hashMatch = false;
  try {
    const hashBuf     = Buffer.from(kr_hash.toLowerCase(),  'hex');
    const computedBuf = Buffer.from(computed,               'hex');
    if (hashBuf.length === computedBuf.length) {
      hashMatch = crypto.timingSafeEqual(computedBuf, hashBuf);
    }
  } catch(_) { hashMatch = false; }

  if (!hashMatch) {
    console.error('HMAC mismatch — posible respuesta manipulada');
    return res.status(403).json({ error: 'Firma inválida — pago no verificado' });
  }

  let answer;
  try { answer = JSON.parse(kr_answer); } catch(e) {
    return res.status(400).json({ error: 'Error al parsear kr_answer' });
  }

  // Validate payment status strictly
  const transaction = answer.transactions?.[0];
  const txStatus    = transaction?.detailedStatus;
  const orderStatus = answer.orderStatus;

  // Only accept confirmed successful statuses
  const VALID_TX_STATUSES    = ['AUTHORISED', 'CAPTURED'];
  const VALID_ORDER_STATUSES = ['PAID'];

  const paid = VALID_TX_STATUSES.includes(txStatus) || VALID_ORDER_STATUSES.includes(orderStatus);

  const amount   = transaction?.amount   || answer.orderDetails?.orderTotalAmount;
  const currency = transaction?.currency || answer.orderDetails?.orderCurrency;
  const orderId  = answer.orderDetails?.orderId;

  // Validate orderId format to prevent injection
  if (orderId && !/^[A-Za-z0-9\-_]+$/.test(orderId)) {
    return res.status(400).json({ error: 'orderId inválido' });
  }

  return res.status(200).json({
    paid, status: txStatus || orderStatus,
    amount, currency, orderId,
    email: answer.customer?.email
  });
}
