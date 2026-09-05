const base='http://localhost:3000';
import Redis from 'ioredis';
const redis=new Redis({host:'localhost',port:6379,maxRetriesPerRequest:null,lazyConnect:false});

async function req(m,p,b,t){
  const h={}; if(t) h['Authorization']=`Bearer ${t}`;
  if(b && !(b instanceof FormData)) h['Content-Type']='application/json';
  const r=await fetch(`${base}${p}`,{method:m,headers:h,body: b?JSON.stringify(b):undefined});
  const txt=await r.text();
  let j; try{j=JSON.parse(txt)}catch{j=txt}
  return {status:r.status, body:j, txt};
}
async function fetchMailhog(){
  try{
    const r=await fetch('http://localhost:8025/api/v2/messages');
    const j=await r.json();
    return j;
  }catch(e){ return {error:e.message}; }
}
async function main(){
  console.log('=== Clear rate limiter ===');
  await redis.del('email:daily:zset');
  console.log('cleared');

  console.log('\n=== Check mailhog API ===');
  let m=await fetchMailhog();
  console.log('mailhog messages:', m.count ?? m.total ?? JSON.stringify(m).slice(0,500));

  // Create admin for cert test
  const adminEmail=`admin_mail_${Date.now().toString().slice(-6)}@example.com`;
  await req('POST','/api/auth/register',{email:adminEmail,password:'Password123!',full_name:'Admin',phone_number:'08123456789'});
  let c=await import('pg').then(m=>m.default ? m.default : m);
  // Use pg directly
  const {Client}=await import('pg');
  let client=new Client({connectionString:'postgres://postgres:admin@localhost:5432/elobrightdb'});
  await client.connect();
  await client.query(`UPDATE users SET is_verified=true, role='admin' WHERE email=$1`,[adminEmail]);
  await client.end();
  let r=await req('POST','/api/auth/login',{email:adminEmail,password:'Password123!'});
  const adminToken=r.body.token;
  console.log('admin login',r.status);

  console.log('\n=== Test 1: Register (verification email) ===');
  const user1=`test_verify_${Date.now().toString().slice(-6)}@example.com`;
  r=await req('POST','/api/auth/register',{email:user1,password:'Password123!',full_name:'Test Verify',phone_number:'08123456789'});
  console.log('register',r.status, JSON.stringify(r.body).slice(0,300));
  await new Promise(r=>setTimeout(r,2000));
  m=await fetchMailhog();
  console.log('mailhog after verify:', m.count, m.items?.[0]?.Content?.Headers?.Subject?.[0]);

  console.log('\n=== Test 2: Forgot password (password-reset) ===');
  // Create a verified user first
  const user2=`test_reset_${Date.now().toString().slice(-6)}@example.com`;
  await req('POST','/api/auth/register',{email:user2,password:'Password123!',full_name:'Test Reset',phone_number:'08123456789'});
  let c2=new Client({connectionString:'postgres://postgres:admin@localhost:5432/elobrightdb'}); await c2.connect();
  await c2.query(`UPDATE users SET is_verified=true WHERE email=$1`,[user2]);
  await c2.end();
  r=await req('POST','/api/auth/forgot-password',{email:user2});
  console.log('forgot-password',r.status, JSON.stringify(r.body).slice(0,200));
  await new Promise(r=>setTimeout(r,2000));
  m=await fetchMailhog();
  console.log('mailhog after reset:', m.count, m.items?.[0]?.Content?.Headers?.Subject?.[0]);

  console.log('\n=== Test 3: Certificate email (if cert exists) ===');
  // Find a certification score
  let c3=new Client({connectionString:'postgres://postgres:admin@localhost:5432/elobrightdb'}); await c3.connect();
  let cert=await c3.query(`SELECT cs.id, cs.exam_submission_id, es.exam_id FROM certification_score cs JOIN exam_submissions es ON es.id=cs.exam_submission_id LIMIT 1`);
  console.log('cert found',cert.rows[0]);
  await c3.end();
  if(cert.rows[0]){
    r=await req('POST','/api/certification-scores/blast-email',{examSubmissionId: cert.rows[0].exam_submission_id}, adminToken);
    console.log('blast-email',r.status, JSON.stringify(r.body).slice(0,300));
    await new Promise(r=>setTimeout(r,2000));
    m=await fetchMailhog();
    console.log('mailhog after cert:', m.count, m.items?.[0]?.Content?.Headers?.Subject?.[0]);
  }

  console.log('\n=== Check rate limiter status ===');
  const { getRateLimitStatus } = await import('./src/worker/emailRateLimiter.ts');
  // Need to use compiled? Try direct redis
  const now=Date.now();
  const windowStart=now-86400000;
  const res=await redis.pipeline().zremrangebyscore('email:daily:zset','0',windowStart.toString()).zcard('email:daily:zset').zrange('email:daily:zset',0,0,'WITHSCORES').exec();
  const current=res?.[1]?.[1] ?? 0;
  console.log(`Current daily count: ${current} (should be 3 if all 3 sent)`);
  console.log(`Remaining: ${80 - current}, Limit: 80, ResetAt: ${new Date((res?.[2]?.[1]?.[1] ? Number(res[2][1][1]) : now) + 86400000).toISOString()}`);

  console.log('\n=== Check all mailhog messages ===');
  m=await fetchMailhog();
  console.log('total messages:', m.count);
  for(let i=0;i<Math.min(3, m.items?.length||0); i++){
    const msg=m.items[i];
    console.log(`#${i}: To=${msg.Content.Headers.To?.[0]}, Subject=${msg.Content.Headers.Subject?.[0]}, From=${msg.Content.Headers.From?.[0]}`);
  }

  await redis.quit();
  console.log('\n=== Done ===');
}
main().catch(e=>{console.error(e); process.exit(1);});
