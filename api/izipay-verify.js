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

  const { kr_answer, kr_hash, kr_hash_algorithm } = req.body;
  if (!kr_answer || !kr_hash) return res.status(400).json({ error: 'Faltan kr_answer o kr_hash' });

  const algo     = (kr_hash_algorithm || 'sha256').replace('hmac_', '');
  const computed = crypto.createHmac(algo, HMAC_KEY).update(kr_answer).digest('hex');

  let hashMatch = false;
  try {
    hashMatch = crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(kr_hash, 'hex'));
  } catch(_) { hashMatch = false; }

  if (!hashMatch) return res.status(403).json({ error: 'Firma inválida — pago no verificado' });

  let answer;
  try { answer = JSON.parse(kr_answer); } catch(e) {
    return res.status(400).json({ error: 'Error al parsear kr_answer' });
  }

  const transaction = answer.transactions?.[0];
  const status      = transaction?.detailedStatus || answer.orderStatus;
  const paid        = status === 'AUTHORISED' || status === 'CAPTURED' || answer.orderStatus === 'PAID';
  const amount      = transaction?.amount || answer.orderDetails?.orderTotalAmount;
  const currency    = transaction?.currency || answer.orderDetails?.orderCurrency;
  const orderId     = answer.orderDetails?.orderId;

  return res.status(200).json({ paid, status, amount, currency, orderId, email: answer.customer?.email });
}
