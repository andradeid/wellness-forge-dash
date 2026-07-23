import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const url = process.env.SUPABASE_URL;
const srk = process.env.LUMMA_SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, srk, { auth: { persistSession: false } });

const TAG_MIGRADO = '828a8849-3db5-4cca-b586-3a082cb84753';
const { data: blackTag } = await sb.from('user_tags').select('id').eq('label','Black 2025').maybeSingle();
if (!blackTag) { console.error('Black 2025 tag não encontrada'); process.exit(1); }
const TAG_BLACK2025 = blackTag.id;
console.log('Black 2025 tag:', TAG_BLACK2025);

const emails = fs.readFileSync('/mnt/documents/novos.txt','utf8')
  .split('\n').map(s=>s.trim().toLowerCase()).filter(s=>s.includes('@'));
console.log('Total emails:', emails.length);

const PASSWORD = 'Lumma2@102030';
const PERIOD_END = '2027-07-23T23:59:59Z';

let created=0, skipped=0, errors=[];
for (const email of emails) {
  try {
    // pula se já existe profile
    const { data: existing } = await sb.from('profiles').select('id').ilike('email', email).maybeSingle();
    if (existing) { skipped++; continue; }

    const local = email.split('@')[0];
    const fullName = local.replace(/[._-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

    const { data: cu, error: ce } = await sb.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
      user_metadata: { full_name: fullName }
    });
    if (ce || !cu?.user) { errors.push({email, reason: ce?.message||'create failed'}); continue; }
    const uid = cu.user.id;

    await sb.from('profiles').update({ full_name: fullName, must_change_password: true }).eq('id', uid);
    await sb.from('subscriptions').update({
      plan_type: 'legado_500', status: 'active', unlimited_credits: false,
      current_period_end: PERIOD_END, billing_cycle: 'monthly'
    }).eq('user_id', uid);
    await sb.from('user_credits').upsert({
      user_id: uid, balance: 500, monthly_quota: 500, quota_reset_at: PERIOD_END
    }, { onConflict: 'user_id' });
    await sb.from('profile_tags').upsert([
      { profile_id: uid, tag_id: TAG_MIGRADO },
      { profile_id: uid, tag_id: TAG_BLACK2025 },
    ], { onConflict: 'profile_id,tag_id' });

    created++;
    if (created % 25 === 0) console.log(`... ${created} criados`);
  } catch (e) {
    errors.push({email, reason: String(e)});
  }
}
console.log(JSON.stringify({ created, skipped, errors_count: errors.length }, null, 2));
if (errors.length) {
  fs.writeFileSync('/tmp/create206-errors.json', JSON.stringify(errors,null,2));
  console.log('Sample errors:', errors.slice(0,5));
}
