// Generates a fresh JWT_SECRET + matching ANON_KEY/SERVICE_ROLE_KEY pair for a new
// self-hosted Supabase instance. Cloud project keys must NEVER be reused here — each
// self-hosted instance needs its own secret.
//
// Usage:
//   cd deploy/scripts && npm install
//   node generate-keys.mjs
//
// Paste the three printed values into deploy/supabase/.env (JWT_SECRET, ANON_KEY,
// SERVICE_ROLE_KEY) before `docker compose up -d`.

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const secret = crypto.randomBytes(40).toString('base64');
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 10 * 365 * 24 * 60 * 60; // 10 years

// noTimestamp is NOT set here — jsonwebtoken deletes payload.iat when it's true.
// Omitting it makes sign() keep our explicit iat (it only auto-fills iat if absent).
const anonKey = jwt.sign({ role: 'anon', iss: 'supabase', iat, exp }, secret, { algorithm: 'HS256' });
const serviceRoleKey = jwt.sign({ role: 'service_role', iss: 'supabase', iat, exp }, secret, { algorithm: 'HS256' });

console.log('JWT_SECRET=' + secret);
console.log('ANON_KEY=' + anonKey);
console.log('SERVICE_ROLE_KEY=' + serviceRoleKey);
