// Copies every file referenced in IMPL_ATTACHMENTS.file_url from the old Supabase
// project's storage bucket to the new one. Run this BEFORE fix-file-urls.sql, so
// files exist at the new domain before the DB rows start pointing at it.
//
// Usage:
//   cd migration && npm install
//   OLD_SUPABASE_URL=https://xxxx.supabase.co \
//   OLD_SERVICE_ROLE_KEY=eyJ... \
//   NEW_SUPABASE_URL=https://api.newdomain.com \
//   NEW_SERVICE_ROLE_KEY=eyJ... \
//   BUCKET=impl-attachments \
//   node migrate-storage.mjs
//
// Service role keys are required (not anon) — download/upload here must bypass RLS
// and read the full attachment table regardless of policy.

import { createClient } from '@supabase/supabase-js';

const BUCKET = process.env.BUCKET || 'impl-attachments';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const oldUrl = requireEnv('OLD_SUPABASE_URL');
const oldKey = requireEnv('OLD_SERVICE_ROLE_KEY');
const newUrl = requireEnv('NEW_SUPABASE_URL');
const newKey = requireEnv('NEW_SERVICE_ROLE_KEY');

const oldClient = createClient(oldUrl, oldKey);
const newClient = createClient(newUrl, newKey);

function extractPath(fileUrl) {
  const marker = `/object/public/${BUCKET}/`;
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(fileUrl.slice(idx + marker.length));
}

async function main() {
  const { data: rows, error } = await oldClient
    .from('IMPL_ATTACHMENTS')
    .select('id, file_name, file_url');

  if (error) {
    console.error('Failed to read IMPL_ATTACHMENTS from old project:', error.message);
    process.exit(1);
  }

  const paths = [...new Set(
    rows.map((r) => extractPath(r.file_url)).filter(Boolean)
  )];

  console.log(`Found ${rows.length} attachment rows → ${paths.length} unique files to copy.\n`);

  const failed = [];
  let ok = 0;

  for (const path of paths) {
    process.stdout.write(`  ${path} ... `);
    const { data: blob, error: dlErr } = await oldClient.storage.from(BUCKET).download(path);
    if (dlErr) {
      console.log('DOWNLOAD FAILED:', dlErr.message);
      failed.push({ path, stage: 'download', error: dlErr.message });
      continue;
    }

    const { error: upErr } = await newClient.storage.from(BUCKET).upload(path, blob, { upsert: true });
    if (upErr) {
      console.log('UPLOAD FAILED:', upErr.message);
      failed.push({ path, stage: 'upload', error: upErr.message });
      continue;
    }

    console.log('ok');
    ok++;
  }

  console.log(`\nDone. ${ok}/${paths.length} files copied.`);
  if (failed.length) {
    console.log(`${failed.length} failed — see failed-uploads.json`);
    const fs = await import('node:fs');
    fs.writeFileSync('failed-uploads.json', JSON.stringify(failed, null, 2));
    process.exitCode = 1;
  }
}

main();
