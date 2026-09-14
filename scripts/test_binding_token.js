const fs = require('fs');
const crypto = require('crypto');

const envVars = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
process.env.J10_INTEGRATION_ENCRYPTION_KEY = envVars.J10_INTEGRATION_ENCRYPTION_KEY;

function getSigningKey() {
  const encKey = process.env.J10_INTEGRATION_ENCRYPTION_KEY?.trim();
  if (encKey) {
    try {
      const buf = Buffer.from(encKey, "base64");
      if (buf.length === 32) return buf;
    } catch {}
  }
  return crypto.createHash("sha256").update(encKey || "j10-default-binding-secret-key").digest();
}

function uuidToBuffer(uuid) {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function bufferToUuid(buf) {
  const hex = buf.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const usedNonces = new Set();

// Token format (32 bytes):
// [0..15] : 16 bytes Workspace UUID
// [16..19]: 4 bytes Expire timestamp (epoch seconds, uint32BE)
// [20..23]: 4 bytes Nonce (uint32BE)
// [24..31]: 8 bytes HMAC-SHA256 signature (truncated 64-bit MAC)
function generateBindingToken(workspaceId, ttlSec = 1800) {
  const wsBuf = uuidToBuffer(workspaceId);
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + ttlSec;
  const nonce = crypto.randomBytes(4);

  const expBuf = Buffer.alloc(4);
  expBuf.writeUInt32BE(expSec, 0);

  const body = Buffer.concat([wsBuf, expBuf, nonce]); // 24 bytes
  const hmac = crypto.createHmac('sha256', getSigningKey());
  hmac.update(body);
  const sig = hmac.digest().subarray(0, 8); // 8 bytes

  const tokenBytes = Buffer.concat([body, sig]); // 32 bytes
  return `b_${tokenBytes.toString('base64url')}`;
}

function verifyBindingToken(tokenStr, expectedWorkspaceId) {
  if (!tokenStr || !tokenStr.startsWith('b_')) {
    return { valid: false, error: 'Invalid token prefix' };
  }
  const rawB64 = tokenStr.slice(2);
  const buf = Buffer.from(rawB64, 'base64url');
  if (buf.length !== 32) {
    return { valid: false, error: 'Invalid token byte length' };
  }

  const body = buf.subarray(0, 24);
  const sig = buf.subarray(24, 32);

  const hmac = crypto.createHmac('sha256', getSigningKey());
  hmac.update(body);
  const expectedSig = hmac.digest().subarray(0, 8);

  if (!crypto.timingSafeEqual(sig, expectedSig)) {
    return { valid: false, error: 'Token signature verification failed (tampered)' };
  }

  const wsBuf = body.subarray(0, 16);
  const wsId = bufferToUuid(wsBuf);
  const expSec = body.readUInt32BE(16);
  const nonce = body.readUInt32BE(20);

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > expSec) {
    return { valid: false, error: 'Binding token expired' };
  }

  const nonceKey = `${wsId}:${nonce}`;
  if (usedNonces.has(nonceKey)) {
    return { valid: false, error: 'Binding token replay rejected' };
  }
  usedNonces.add(nonceKey);

  if (expectedWorkspaceId && wsId !== expectedWorkspaceId) {
    return { valid: false, error: 'Cross-workspace binding rejected' };
  }

  return { valid: true, workspaceId: wsId };
}

console.log('=== TEST: Cryptographic 64-char Telegram Binding Tokens ===');
const wsId = 'ce593364-2aaf-47e4-a1d2-2272775747c4';
const token = generateBindingToken(wsId);
console.log('Generated token:', token, 'Length:', token.length);

// 1. Valid verification
const v1 = verifyBindingToken(token, wsId);
console.log('✔ Verification result:', v1);
if (!v1.valid || v1.workspaceId !== wsId) throw new Error('Valid token failed');

// 2. Replay check
const v2 = verifyBindingToken(token, wsId);
console.log('✔ Replay check:', v2.error);
if (v2.valid) throw new Error('Replay should have been rejected');

// 3. Tampering check
const tokenTampered = token.slice(0, -3) + 'abc';
const v3 = verifyBindingToken(tokenTampered, wsId);
console.log('✔ Tamper check:', v3.error);
if (v3.valid) throw new Error('Tampered token should have been rejected');

// 4. Expiration check
const expiredToken = generateBindingToken(wsId, -10);
const v4 = verifyBindingToken(expiredToken, wsId);
console.log('✔ Expiry check:', v4.error);
if (v4.valid) throw new Error('Expired token should have been rejected');

// 5. Cross-workspace check
const anotherToken = generateBindingToken('00000000-0000-0000-0000-000000000001');
const v5 = verifyBindingToken(anotherToken, wsId);
console.log('✔ Cross-workspace check:', v5.error);
if (v5.valid) throw new Error('Cross-workspace token should have been rejected');

console.log('=== ALL BINDING TOKEN TESTS PASSED (Length 45 <= 64 chars) ===');
