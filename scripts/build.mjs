import fs from 'node:fs/promises';

const OWNER='todayplus', SELF='todayplus_link_dashboard';
const TOKEN=process.env.GITHUB_TOKEN;
const H={'User-Agent':'dash-builder', ...(TOKEN?{Authorization:`Bearer ${TOKEN}`}:{})};

const txt = h => h
  .replace(/<script[\s\S]*?<\/script>/gi,' ')
  .replace(/<style[\s\S]*?<\/style>/gi,' ')
  .replace(/<!--[\s\S]*?-->/g,' ')
  .replace(/<[^>]+>/g,' ')
  .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
  .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
  .replace(/\s+/g,' ').trim();

function sections(html){
  const body=(html.split(/<body[^>]*>/i)[1]||html).split(/<\/body>/i)[0];
  const re=/<[a-z][a-z0-9]*\b[^>]*\sid=["']([^"']+)["'][^>]*>/gi;
  const marks=[]; let m;
  while((m=re.exec(body))) marks.push({id:m[1],at:m.index});
  const out=[];
  const push=(id,html)=>{
    const t=txt(html); if(t.length<25) return;
    const h=(html.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i)||[])[1];
    out.push({id,h:h?txt(h).slice(0,60):'',t:t.slice(0,3000)});
  };
  if(!marks.length){ push('',body); return out; }
  marks.forEach((mk,i)=>push(mk.id, body.slice(mk.at,(marks[i+1]||{at:body.length}).at)));
  return out.slice(0,80);
}

async function page(url){
  try{
    const r=await fetch(url,{redirect:'follow'});
    if(!r.ok) return {ok:false,code:r.status};
    const h=await r.text();
    return {
      ok:true, code:r.status,
      title:((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').trim().split('|')[0].trim(),
      autoDesc:((h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)||[])[1]||'').trim(),
      sections:sections(h)
    };
  }catch(e){ return {ok:false,code:0}; }
}

const read=async p=>{try{return JSON.parse(await fs.readFile(p,'utf8'))}catch(e){return {}}};

const meta=await read('meta.json');
const repos=await (await fetch(
  `https://api.github.com/users/${OWNER}/repos?per_page=100&sort=updated`,{headers:H})).json();

const targets=new Map();
repos.filter(r=>r.has_pages&&!r.fork&&r.name!==SELF)
  .forEach(r=>targets.set(r.name,{url:`https://${OWNER}.github.io/${r.name}/`,
    pushed:r.pushed_at, repo:r.html_url}));
Object.entries(meta).forEach(([k,v])=>{ if(v.url&&!targets.has(k)) targets.set(k,{url:v.url}); });

const data={}, index={}, bad=[], neu=[];
for(const [id,base] of targets){
  const p=await page(base.url);
  data[id]={...base, title:p.title||id, autoDesc:p.autoDesc||'', ok:p.ok, code:p.code,
            checked:new Date().toISOString()};
  if(p.ok && p.sections?.length) index[id]={url:base.url,title:p.title||id,sections:p.sections};
  if(!p.ok) bad.push(`${id} (HTTP ${p.code})`);
  if(!meta[id]) neu.push(id);
  console.log(`${p.ok?'OK ':'FAIL'} ${id}`);
}

await fs.writeFile('data.json', JSON.stringify(data,null,2));
await fs.writeFile('search-index.json', JSON.stringify(index));

const sum=[`## 대시보드 자동 갱신`,``,
 `- 수집 페이지: **${Object.keys(data).length}**개`,
 `- 색인 페이지: **${Object.keys(index).length}**개`,
 bad.length?`- ⚠ 접속 실패: ${bad.join(', ')}`:`- 접속 실패 없음`,
 neu.length?`- meta.json 미등록(분류 필요): ${neu.join(', ')}`:`- 미등록 항목 없음`].join('\n');
if(process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,sum+'\n');
console.log(sum);
