const base='http://localhost:3000';
async function req(m,p,b){
  const r=await fetch(`${base}${p}`,{method:m,headers:{'Content-Type':'application/json'},body: b?JSON.stringify(b):undefined});
  const j=await r.json().catch(()=> ({}));
  return {status:r.status, body:j};
}
async function main(){
  console.log('Register 3 users with limit 2, expect 2 immediate, 1 delayed');
  for(let i=0;i<3;i++){
    const email=`limit2_${Date.now()}_${i}@example.com`;
    const r=await req('POST','/api/auth/register',{email,password:'Password123!',full_name:`Test${i}`,phone_number:'08123456789'});
    console.log(`Register ${i}: ${r.status}`);
    await new Promise(r=>setTimeout(r,500));
  }
  console.log('Waiting 3 seconds for worker...');
  await new Promise(r=>setTimeout(r,3000));
  // Check redis
  const Redis= (await import('ioredis')).default;
  const redis=new Redis({host:'localhost',port:6379,maxRetriesPerRequest:null,lazyConnect:false});
  const cnt=await redis.zcard('email:daily:zset');
  console.log(`Daily count after 3 registers (should be 2): ${cnt}`);
  const range=await redis.zrange('email:daily:zset',0,-1,'WITHSCORES');
  console.log('ZSET:', range);
  // Check queue
  const {Queue}=await import('bullmq');
  const q=new Queue('email',{connection:{host:'localhost',port:6379,maxRetriesPerRequest:null}});
  console.log(`Waiting: ${(await q.getWaiting()).length}, Active: ${(await q.getActive()).length}, Delayed: ${(await q.getDelayed()).length}, Completed: ${(await q.getCompleted()).length}, Failed: ${(await q.getFailed()).length}`);
  const delayed=await q.getDelayed();
  for(const j of delayed) console.log(`Delayed ${j.id} to=${j.data.to} delay=${j.delay} attempts=${j.attemptsMade}`);
  await redis.quit();
  await q.close();
}
main().catch(e=>{console.error(e); process.exit(1);});
