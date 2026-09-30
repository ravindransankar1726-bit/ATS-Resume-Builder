/* v2 layer: loaded after script.js. Overrides/extends globals; existing auth, save, PDF, history, share are untouched. */
const $=id=>document.getElementById(id);
const esc=s=>escapeHtml(String(s??''));

/* ---------- Toasts (replaces alert) ---------- */
document.body.insertAdjacentHTML('beforeend','<div id="toasts"></div>');
function toast(msg,type='info'){const t=document.createElement('div');t.className='toast '+type;t.textContent=msg;$('toasts').appendChild(t);setTimeout(()=>t.remove(),3500);}
window.alert=m=>toast(m,'err');

/* ---------- Auth: show/hide + confirm password ---------- */
function togglePw(){const i=$('auth_password');i.type=i.type==='password'?'text':'password';}
const _switchTab=switchAuthTab;
switchAuthTab=function(m){_switchTab(m);$('confirmWrap').style.display=m==='signup'?'block':'none';};
const _authSubmit=handleAuthSubmit;
handleAuthSubmit=function(){
  const err=$('authError');
  if(authMode==='signup'){
    const pw=$('auth_password').value;
    if(pw.length<8||pw!==$('auth_confirm').value){err.textContent=pw.length<8?'Password must be at least 8 characters.':'Passwords do not match.';err.style.display='block';return;}
  }
  return _authSubmit();
};



/* ---------- AI service (mock; swap the body of complete() for a real API call) ---------- */
const AI={
  // To connect a real model: POST {task, resume} to YOUR server endpoint (keys stay server-side).
  ENDPOINT:null,
  async complete(task,r){
    if(this.ENDPOINT){const res=await fetch(this.ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(await supabaseClient.auth.getSession()).data.session.access_token},body:JSON.stringify({task,resume:r})});return (await res.json()).text;}
    return this.mock(task,r);
  },
  mock(task,r){
    const sk=(r.skills||[]).slice(0,5).join(', '),role=r.targetTitle||'professional';
    if(task==='summary')return `${r.experience_level==='experienced'?'Experienced':'Motivated'} ${role}${sk?' skilled in '+sk:''}${r.edu?', with a background in '+r.edu.split('\n')[0]:''}. Seeking to contribute to a ${role} position.`.slice(0,500);
    return (r.summary||'').trim();
  }
};

/* ---------- Deterministic ATS engine (weights sum to 100) ---------- */
const ATS={
  STOP:new Set('a an the and or of to in for with on at is are be we you our will should this that as by from it'.split(' ')),
  keywords(jd){return [...new Set((jd.toLowerCase().match(/[a-z][a-z0-9+.#]{1,}/g)||[]).filter(w=>!this.STOP.has(w)&&(SKILL_DICTIONARY.includes(w)||w.length>5)))].slice(0,40);},
  score(r,jd){
    const txt=[r.summary,r.exp,r.edu,r.certs,r.achievements,(r.skills||[]).join(' ')].join(' ').toLowerCase();
    const has=v=>String(v||'').trim().length>0,cat={};
    cat.contact=Math.round(10*[r.name,r.email,r.phone,r.location,r.linkedin||r.github].filter(has).length/5);
    const sw=(r.summary||'').split(/\s+/).filter(Boolean).length;cat.summary=sw>=25&&sw<=90?10:sw>0?5:0;
    cat.skills=Math.min(15,Math.round((r.skills||[]).length*15/8));
    const ew=(r.exp||'').split(/\s+/).filter(Boolean).length;cat.experience=Math.min(15,(ew>=20?9:ew>0?4:0)+(/\d/.test(r.exp||'')?6:0));
    cat.education=has(r.edu)?10:0;
    cat.projects=/project|built|developed|created/i.test(r.exp||'')?(ew>=20?15:8):0;
    const kw=jd?this.keywords(jd):[],matched=kw.filter(k=>txt.includes(k)),missing=kw.filter(k=>!txt.includes(k));
    cat.keywords=kw.length?Math.round(15*matched.length/kw.length):(has(r.jd)?0:8);
    cat.formatting=10-(/[│┃■●◆]|\t{2,}/.test(txt)?4:0)-(ew>400?3:0);
    return{total:Object.values(cat).reduce((a,b)=>a+b,0),cat,matched,missing};
  },
  MAX:{contact:10,summary:10,skills:15,experience:15,education:10,projects:15,keywords:15,formatting:10},
  tips(res){const t=[];const c=res.cat,m=this.MAX;
    if(c.contact<m.contact)t.push('Complete your contact details (email, phone, location, LinkedIn or GitHub).');
    if(c.summary<m.summary)t.push('Write a 25–90 word professional summary.');
    if(c.skills<m.skills)t.push('List more relevant skills you actually have (aim for 8+).');
    if(c.experience<m.experience)t.push('Expand experience/project descriptions; add numbers only where they are true.');
    if(c.projects<m.projects)t.push('Describe projects with technologies used and what you built.');
    if(res.missing.length)t.push('Job-description keywords not found in your resume: '+res.missing.slice(0,8).join(', ')+'. Add only those that reflect real experience.');
    return t.length?t:['Great — no major issues found.'];}
};

/* ---------- Top navigation ---------- */
const NAV=[['dashboard','Dashboard'],['builder','Resume Builder'],['analyzer','AI Analyzer'],['coach','Interview Coach'],['support','Finding issues ?']];
APP_PAGES.push('page-analyzer','page-coach','page-applications','page-support');
function buildShell(){
  if($('topnav'))return;
  $('page-app').insertAdjacentHTML('afterbegin',`<header class="topnav" id="topnav"><div class="topnav-in">
   <div class="tn-brand" onclick="nav('dashboard')"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21 11 3h2l7 18M8 14h8"/></svg><span>ATS Resume Builder</span></div>
   <div class="tn-right"><span class="uname">${esc(currentUser.email||currentUser.name||'')}</span><button class="tn-out" onclick="logout()">Sign Out</button></div></div>
   <div class="tn-bar"><button class="tn-burger" onclick="$('tnLinks').classList.toggle('open')">☰ Menu</button>
   <nav class="tn-links" id="tnLinks">${NAV.map(n=>`<a data-n="${n[0]}" onclick="nav('${n[0]}')">${n[1]}</a>`).join('')}</nav></div></header>`);
  const app=document.querySelector('#page-app .app');
  app.insertAdjacentHTML('beforeend',['analyzer','coach','applications','support'].map(p=>`<div id="page-${p}" style="display:none"></div>`).join(''));
}
function nav(p){
  buildShell();$('tnLinks').classList.remove('open');
  document.querySelectorAll('.tn-links a').forEach(a=>a.classList.toggle('active',a.dataset.n===p));
  
  if(p==='dashboard')return goToDashboard();
  if(p==='builder')return currentResumeId?showAppPage('page-builder'):(toast('Open or create a resume first'),goToDashboard());
  showAppPage('page-'+p);({analyzer:renderAnalyzer,coach:renderCoach,support:renderSupport})[p]();
}
const _dash=goToDashboard;
goToDashboard=async function(){buildShell();await _dash();$('dashGreeting').textContent='Dashboard';document.querySelectorAll('.tn-links a').forEach(a=>a.classList.toggle('active',a.dataset.n==='dashboard'));};
const _open=openResume;
openResume=async function(id){buildShell();await _open(id);document.querySelectorAll('.tn-links a').forEach(a=>a.classList.toggle('active',a.dataset.n==='builder'));fillDefaults();buildStepper();initBuilderBar();};

/* ---------- Dashboard: stats + cards with Duplicate ---------- */
loadDashboardStats=async function(){
  const{data:rs}=await supabaseClient.from('resumes').select('ats_score').eq('user_id',currentUser.id);
  const sc=(rs||[]).map(r=>r.ats_score).filter(s=>s!=null);
  const ic={f:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6"/>',b:'<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',s:'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'};
  const card=(k,c,l,v)=>`<div class="sc"><div><div class="sc-l">${l}</div><div class="sc-v">${v}</div></div><span class="sc-i ${c}"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ic[k]}</svg></span></div>`;
  $('statRow').className='stat-row3';
  $('statRow').innerHTML=card('f','b','Total Resumes',(rs||[]).length)+card('b','g','Average Score',(sc.length?Math.round(sc.reduce((a,b)=>a+b,0)/sc.length):0)+'%')+card('s','y','Best Score',(sc.length?Math.max(...sc):0)+'%');
};
loadResumeList=async function(){
  const g=$('resumeGrid');g.className='rl-card';g.innerHTML='<div class="empty-dash">Loading…</div>';
  const{data,error}=await supabaseClient.from('resumes').select('*').eq('user_id',currentUser.id).order('updated_at',{ascending:false});
  if(error){console.error(error);g.innerHTML='<div class="empty-dash">Couldn\'t load resumes.</div>';toast('Could not load resumes','err');return;}
  if(!data.length){g.innerHTML='<div class="empty-dash">No resumes yet — click <b>Create Resume</b> to start.</div>';return;}
  g.innerHTML=data.map(r=>`<div class="rl-row"><div><div class="rl-t">${esc(r.title)}</div><div class="rl-d">Created ${new Date(r.created_at).toLocaleDateString()}${r.ats_score!=null?' · ATS '+r.ats_score+'/100':''}</div></div>
   <div class="rl-a"><button title="Edit" onclick="openResume('${r.id}')">✎</button><button title="Duplicate" onclick="duplicateResume('${r.id}')">⧉</button><button title="Delete" class="del" onclick="deleteResume('${r.id}')">🗑</button></div></div>`).join('');
};
async function duplicateResume(id){
  const{data}=await supabaseClient.from('resumes').select('*').eq('id',id).eq('user_id',currentUser.id).single();
  if(!data)return toast('Could not duplicate','err');
  const{id:_i,created_at,updated_at,is_public,...copy}=data;copy.title+=' (copy)';
  const{error}=await supabaseClient.from('resumes').insert(copy);
  error?toast('Could not duplicate','err'):(toast('Resume duplicated','ok'),goToDashboard());
}

/* ---------- Create resume: experience modal, no demo data ---------- */
createNewResume=function(){
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-bg" id="expModal"><div class="modal"><h2 style="margin:0">Tell us about your experience</h2><p style="color:var(--muted)">This helps us tailor your resume sections better.</p>
   <div class="opt" onclick="startResume('fresher')">🎓 <b>Fresher</b><small>Student or no professional experience yet</small></div>
   <div class="opt" onclick="startResume('experienced')">💼 <b>Experienced</b><small>Worked professionally before</small></div>
   <button class="btn-o" style="margin-top:14px" onclick="$('expModal').remove()">Cancel</button></div></div>`);
};
/* ---------- Default sample data (fresher / experienced) ---------- */
const DEF={
 fresher:{target_title:'Junior Full Stack Developer',
  summary:'BCA final year student with hands-on experience building responsive web applications using HTML, CSS, JavaScript, React, Node.js and SQL. Built a full-stack ATS resume builder with REST API integration and Git-based workflow. Seeking a junior full stack developer role to apply problem-solving skills and deliver clean, user-friendly features.',
  skills:['HTML','CSS','JavaScript','React','Node.js','SQL','REST API','Git'],
  experience:'ATS Resume Builder — Final Year Project (2026)\n- Developed a full-stack web application with responsive UI, Node.js logic and SQL database using Supabase\n- Implemented REST API integration, user authentication and resume autosave, tested with 100+ sample records\n- Improved ATS keyword matching accuracy by 30% using a rule-based scoring engine\n- Used Git and GitHub for version control while working with a team of 3\n\nPortfolio Website — Personal Project (2025)\n- Built a responsive portfolio using HTML, CSS and JavaScript that loads in under 2 seconds\n- Deployed on GitHub Pages and scored 95+ in Lighthouse performance',
  job_description:'We are hiring a Junior Full Stack Developer (Fresher) with knowledge of HTML, CSS, JavaScript, React, Node.js, SQL, REST API and Git. The candidate should be able to build responsive web applications, work with databases, and collaborate with a team. Good communication and problem-solving skills are required.'},
 experienced:{target_title:'Full Stack Developer',
  summary:'Full Stack Developer with 2+ years of experience building scalable web applications using JavaScript, React, Node.js and SQL. Delivered REST API features used by 10,000+ users and improved performance by 40%. Looking for a challenging full stack role.',
  skills:['JavaScript','React','Node.js','SQL','REST API','Git','HTML','CSS'],
  experience:'Software Developer — Company Name (2023–Present)\n- Developed and maintained React and Node.js features used by 10,000+ users\n- Improved page load time by 40% through code optimisation and caching\n- Built 15+ REST API endpoints backed by a SQL database\n- Collaborated with designers and testers using Git and agile sprints',
  job_description:'We are looking for a Full Stack Developer with 2+ years of experience in JavaScript, React, Node.js, SQL, REST API and Git. Responsibilities include building scalable web applications, writing clean code and working with cross-functional teams.'},
 education:'BCA, Your College Name — 2024–2027',
 intern:'Web Development Intern — Company Name (Jun–Jul 2025)\n- Built 3 responsive web pages using HTML, CSS and JavaScript\n- Fixed 10+ UI bugs and improved mobile layout',
 hobbies:'Coding, Reading, Photography',
 certs:'Full-Stack Web Development — Coursera (2025)\nResponsive Web Design — freeCodeCamp (2024)',
 ach:'Winner, college-level hackathon (2025)\nBuilt and deployed 3 personal web projects',
 lang:'English, Tamil'
};
async function startResume(level){
  $('expModal').remove();const d=DEF[level]||DEF.fresher;
  const{data,error}=await supabaseClient.from('resumes').insert({user_id:currentUser.id,title:d.target_title+' Resume',template:'tpl-ats',experience_level:level,
    name:currentUser.name,email:currentUser.email,phone:'+91 98765 43210',location:'Chennai, Tamil Nadu',linkedin:'linkedin.com/in/yourname',github:'github.com/yourname',
    target_title:d.target_title,summary:d.summary,skills:d.skills,experience:d.experience,education:DEF.education,job_description:d.job_description,
    certifications:DEF.certs,achievements:DEF.ach,languages:DEF.lang,internships:DEF.intern,hobbies:DEF.hobbies}).select().single();
  if(error){console.error(error);return toast('Could not create resume: '+error.message,'err');}
  toast('Resume created','ok');openResume(data.id);
}
function fillDefaults(){
  const d=DEF.fresher,set=(id,v)=>{const e=$(id);if(e&&!e.value.trim())e.value=v;};
  set('f_title',d.target_title);set('f_summary',d.summary);set('f_exp',d.experience);set('f_jd',d.job_description);
  set('f_edu',DEF.education);set('f_certs',DEF.certs);set('f_achievements',DEF.ach);set('f_languages',DEF.lang);set('f_internships',DEF.intern);set('f_hobbies',DEF.hobbies);
  if(!skills.length){skills=d.skills.slice();renderSkillTags();}
  renderPreview();scheduleAutosave();
}
function changeExperience(){document.body.insertAdjacentHTML('beforeend',`<div class="modal-bg" id="expModal"><div class="modal"><h2 style="margin:0">Change experience level</h2><p style="color:var(--muted)">This replaces title, summary, experience and job description with sample text.</p><div class="opt" onclick="setLevel('fresher')">🎓 Fresher<small>Student or no professional experience yet</small></div><div class="opt" onclick="setLevel('experienced')">💼 Experienced<small>Worked professionally before</small></div><button class="btn-o" style="margin-top:14px" onclick="$('expModal').remove()">Cancel</button></div></div>`);}
async function setLevel(l){$('expModal').remove();const d=DEF[l];
  $('f_title').value=d.target_title;$('f_summary').value=d.summary;$('f_exp').value=d.experience;$('f_jd').value=d.job_description;
  skills=d.skills.slice();renderSkillTags();renderPreview();scheduleAutosave();
  await supabaseClient.from('resumes').update({experience_level:l}).eq('id',currentResumeId).eq('user_id',currentUser.id);toast('Experience level updated','ok');}

/* ---------- Builder: 8-step wizard + top action buttons ---------- */
function initBuilderBar(){
  const ba=document.querySelector('.builder-actions');if(!ba||ba.dataset.v5)return;ba.dataset.v5='1';
  ba.insertAdjacentHTML('afterbegin','<button class="btn-secondary" onclick="changeExperience()">Change Experience</button><button class="tb-prev" onclick="fullPreview()">👁 Full Preview</button><button class="tb-ai" onclick="createNewResume()">✨ Create New</button><button class="tb-save" onclick="saveCurrentResume().then(()=>toast(\'Saved\',\'ok\'))">💾 Save</button>');
}
function buildStepper(){
  const p=document.querySelector('#inputStage .panel');if(!p||p.dataset.stepped)return;p.dataset.stepped='1';
  const NAMES=['Personal Info','Internships (Optional)','Education','Skills','Experience','Languages','Hobbies','Certificates','Achievements','Summary'];
  const MAP={'Full name':0,'Target title':0,'Contact info':0,'Internships (Optional)':1,'Education':2,'Skills':3,'Experience / Project description':4,'Languages':5,'Hobbies & Interests':6,'Certifications':7,'Achievements':8,'Professional summary':9};
  const G=NAMES.map(()=>[]);let cur=0;
  [...p.children].forEach(k=>{if(k.tagName==='H2'||k.classList.contains('sub'))return;const t=k.textContent.trim();if(k.tagName==='LABEL'&&t in MAP)cur=MAP[t];G[cur].push(k);});
  const rail=document.createElement('div'),body=document.createElement('div'),head=document.createElement('div'),foot=document.createElement('div');
  rail.className='stp-rail';body.className='stp-body';head.className='stp-head';foot.className='stp-foot';
  p.classList.add('stepped');body.append(head);G.flat().forEach(k=>body.append(k));body.append(foot);p.append(rail,body);
  let step=0;
  const show=n=>{step=n;G.forEach((g,i)=>g.forEach(k=>k.classList.toggle('stp-hide',i!==n)));
    rail.innerHTML=NAMES.map((_,i)=>`<button type="button" class="${i===n?'on':''}" data-i="${i}">${i+1}</button>`).join('');
    head.innerHTML=`<button type="button" class="stp-arr" data-d="-1" ${n===0?'disabled':''}>‹</button><span class="stp-t">${NAMES[n]}</span><button type="button" class="stp-arr" data-d="1" ${n===NAMES.length-1?'disabled':''}>›</button>`;
    foot.innerHTML=`<button type="button" class="btn-o" data-d="-1" ${n===0?'disabled':''}>‹ PREV</button><button type="button" class="btn-o" data-d="1" ${n===NAMES.length-1?'disabled':''}>NEXT ›</button>`;};
  p.addEventListener('click',e=>{const b=e.target.closest('button[data-i],button[data-d]');if(!b||b.disabled)return;show(b.dataset.i!==undefined?+b.dataset.i:step+ +b.dataset.d);});
  show(0);
}

/* ---------- Suggestions: every one is clickable ---------- */
const _bs=buildSuggestions;
buildSuggestions=function(m,summary,exp,sk){return _bs(m,summary,exp,sk).map(s=>{
  if(/too short|a bit long/.test(s.text))s.type='improve_summary';
  else if(/measurable/.test(s.text))s.type='add_metric';
  else if(/more skill/.test(s.text))s.type='add_skills';
  return s;});};
const _ra=renderAnalysis;
renderAnalysis=function(r){_ra(r);
  document.querySelectorAll('#analysisBody .sugg').forEach((el,i)=>{const s=(r.suggestions||[])[i],b=el.querySelector('button[disabled]');if(!s||!b)return;
    const on=(t,fn)=>{b.disabled=false;b.textContent=t;b.onclick=fn;};
    if(s.type==='add_metric')on('Add measurable achievement',applyMetric);
    if(s.type==='add_skills')on('Add suggested skills',applyMoreSkills);});};
function applyMetric(){const e=$('f_exp');e.value=(e.value.trim()+'\n- Improved page load time by 30% and tested with 100+ sample users').trim();scheduleAutosave();reRunAfterFix();}
function applyMoreSkills(){const pool=[...((lastAnalysis&&lastAnalysis.missing_keywords)||[]),'HTML','CSS','JavaScript','React','Node.js','SQL','Git','REST API','GitHub'],low=skills.map(x=>x.toLowerCase());
  for(const s of pool){if(skills.length>=8)break;if(!low.includes(s.toLowerCase())){skills.push(s);low.push(s.toLowerCase());}}
  renderSkillTags();scheduleAutosave();reRunAfterFix();}

/* ---------- AI Analyzer: PDF upload + saved resume ---------- */
const KNOWN=['HTML','CSS','JavaScript','TypeScript','React','Angular','Vue','Node.js','Express','Python','Java','C++','SQL','MySQL','MongoDB','PostgreSQL','REST API','Git','GitHub','Bootstrap','Tailwind','PHP','Django','Flask','Docker','AWS','Figma','Communication','Problem solving','Teamwork'];
async function renderAnalyzer(){
  const{data}=await supabaseClient.from('resumes').select('id,title').eq('user_id',currentUser.id);
  $('page-analyzer').innerHTML=`<h2>AI Resume Analyzer</h2><p style="color:var(--muted)">Get detailed feedback and improve your resume with AI-powered analysis</p>
  <div class="card2" style="background:#EEF2FF">✨ Free and unlimited — analyze as many resumes as you like.</div>
  <div class="an-grid"><div class="card2"><h3>Upload PDF Resume</h3>
   <label class="an-drop" for="an_pdf"><div style="font-size:34px">⬆</div>Upload your resume in PDF format for analysis<br><span class="btn-p" style="display:inline-block;margin-top:12px">Choose PDF File</span></label>
   <input type="file" id="an_pdf" accept="application/pdf" hidden onchange="analyzePdf(this.files[0])">
   <label>Or pick a saved resume</label><select class="v2-input" id="an_resume">${(data||[]).map(r=>`<option value="${r.id}">${esc(r.title)}</option>`).join('')}</select>
   <label>Job description (optional)</label><textarea class="v2-input" id="an_jd" rows="5" placeholder="Paste job description…"></textarea>
   <button class="btn-ai" onclick="runAnalysis()">Analyze Saved Resume</button></div>
  <div class="card2" id="an_out"><div class="an-empty"><div style="font-size:48px">📊</div><h3>Ready to Analyze</h3><p>Select a resume from your library or upload a PDF to get detailed feedback</p></div></div></div>`;
}
async function analyzePdf(file){
  if(!file)return;$('an_out').innerHTML='<div class="an-empty"><h3>Reading PDF…</h3></div>';
  try{
    if(!window.pdfjsLib){await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=ok;s.onerror=no;document.head.appendChild(s);});
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';}
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;let text='';
    for(let i=1;i<=pdf.numPages;i++){const c=await(await pdf.getPage(i)).getTextContent();text+=c.items.map(t=>t.str).join(' ')+'\n';}
    const low=text.toLowerCase(),jd=$('an_jd').value||'';
    const r={name:'',targetTitle:'',email:(text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)||[''])[0],phone:(text.match(/\+?\d[\d\s-]{8,}/)||[''])[0],location:'',linkedin:/linkedin/i.test(text)?'linkedin':'',github:/github/i.test(text)?'github':'',
      summary:text.slice(0,500),skills:KNOWN.filter(k=>low.includes(k.toLowerCase())),exp:text,edu:text,certs:'',achievements:'',languages:'',jd};
    showAnalysis(ATS.score(r,jd),jd);
  }catch(e){console.error(e);toast('Could not read this PDF','err');$('an_out').innerHTML='<div class="an-empty"><h3>Could not read PDF</h3></div>';}
}
async function runAnalysis(){
  const id=$('an_resume').value;if(!id)return toast('Create a resume first','err');
  const{data}=await supabaseClient.from('resumes').select('*').eq('id',id).eq('user_id',currentUser.id).single();
  const r=rowToState(data),jd=$('an_jd').value||r.jd||'',res=ATS.score(r,jd);
  const{error}=await supabaseClient.from('resumes').update({ats_score:res.total,ats_breakdown:res.cat}).eq('id',id).eq('user_id',currentUser.id);
  error?toast('Could not save score','err'):toast('ATS analysis completed','ok');showAnalysis(res,jd);
}
function showAnalysis(res,jd){
  $('an_out').innerHTML=`<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center"><div class="score-ring" style="background:conic-gradient(var(--primary) ${res.total*3.6}deg,var(--border) 0)"><span style="background:#fff;border-radius:50%;width:92px;height:92px;display:flex;align-items:center;justify-content:center">${res.total}</span></div>
   <div style="flex:1;min-width:220px">${Object.keys(ATS.MAX).map(k=>`<div style="font-size:13px;text-transform:capitalize">${k} — ${res.cat[k]}/${ATS.MAX[k]}</div><div class="bar"><i style="width:${res.cat[k]/ATS.MAX[k]*100}%"></i></div>`).join('')}</div></div>
   <h3>Recommended Improvements</h3><ul>${ATS.tips(res).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
   ${jd?`<h3>Keyword match</h3>${res.matched.map(k=>`<span class="chip2">${esc(k)}</span>`).join('')}${res.missing.map(k=>`<span class="chip2 miss">${esc(k)}</span>`).join('')}`:''}`;
}

/* ---------- Interview Coach (rule-based, free) ---------- */
const QB={html:'What is semantic HTML and why does it matter for accessibility and SEO?',css:'Explain the CSS box model and the difference between Flexbox and Grid.',javascript:'Explain closures, and the difference between var, let and const.',react:'What is the virtual DOM, and how do props differ from state?','node.js':'How does Node.js handle asynchronous work with a single thread?',sql:'Explain INNER JOIN vs LEFT JOIN with a small example.','rest api':'Which HTTP methods and status codes do you use when designing a REST API?',git:'What is the difference between git merge and git rebase?',python:'What is the difference between a list, tuple and dictionary in Python?',java:'Explain OOP concepts (encapsulation, inheritance, polymorphism) with an example.',mongodb:'When would you choose MongoDB over a SQL database?',bootstrap:'How does the Bootstrap grid system make a page responsive?',php:'How do sessions and cookies work in PHP?'};
const HR=[['Tell me about yourself.','Use Present → Past → Future: who you are now, what you built/learned, what role you want.'],['Why should we hire you?','Match 2–3 of your strongest skills to the job, with one proof (project or number).'],['What are your strengths and one weakness?','Pick a real weakness and show what you are doing to improve it.'],['Where do you see yourself in 5 years?','Show growth in the same field: skills, responsibility, contribution to the team.'],['Why do you want this role?','Mention the company/work, then link it to your skills and interests.']];
const BEH=[['Describe a time you worked in a team and faced a conflict.','STAR: Situation, Task, Action (what YOU did), Result.'],['Tell me about a time you had to learn something new quickly.','STAR: name the skill, how you learned it, and what you built with it.'],['Describe a time you missed or nearly missed a deadline.','STAR: be honest, focus on the action you took and what you changed after.']];
const TA={html:['Semantic HTML uses meaningful tags like <header>, <nav>, <main>, <article> and <footer> instead of generic <div>s. It helps screen readers and keyboard users understand the page structure, and helps search engines understand the content, so it improves accessibility and SEO. It also makes the code easier to read and maintain.',['Name 3–4 semantic tags','Accessibility for screen readers','SEO benefit','Cleaner, readable code']],
css:['The box model says every element is a box made of content, padding, border and margin. Flexbox lays items out in one dimension (a row or a column), which is great for navbars and centring. Grid works in two dimensions (rows and columns together), which is best for full page layouts. I use Flexbox inside components and Grid for the overall layout.',['Content → padding → border → margin','Flexbox = 1D, Grid = 2D','Give one use case for each']],
javascript:['A closure is a function that remembers the variables from the place where it was created, even after the outer function has finished. For example, a counter function can keep a private count variable. var is function-scoped and can be redeclared; let is block-scoped and can be reassigned; const is block-scoped and cannot be reassigned. I use const by default and let only when the value changes.',['Closure = function + its outer variables','var vs let vs const scope','Give a counter example','Prefer const']],
react:['The virtual DOM is a lightweight copy of the real DOM. When state changes, React builds a new virtual tree, compares it with the old one (diffing) and updates only the parts that changed, which is faster. Props are read-only data passed from a parent to a child; state is data owned by a component that can change and triggers a re-render.',['Virtual DOM + diffing','Props = read-only, from parent','State = changeable, inside component']],
'node.js':['Node.js runs JavaScript on a single thread but uses an event loop with non-blocking I/O. When it starts a slow task like a file read or a database call, it hands it off and keeps serving other requests; when the task finishes, its callback, promise or async/await continuation runs. That is why one Node process can handle many connections. Heavy CPU work should go to worker threads.',['Single thread + event loop','Non-blocking I/O','Callbacks / promises / async-await']],
sql:['INNER JOIN returns only the rows that have a match in both tables. LEFT JOIN returns all rows from the left table and the matching rows from the right; where there is no match, the right side is NULL. Example: students LEFT JOIN marks lists every student, even those with no marks yet, while INNER JOIN lists only students who have marks.',['INNER = matches only','LEFT = all left rows + matches','Use a students/marks example']],
'rest api':['I use GET to read, POST to create, PUT or PATCH to update and DELETE to remove data. Common status codes: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found and 500 Server Error. Good REST design uses nouns in URLs, like /users/5, and returns JSON with the correct status code.',['GET / POST / PUT / DELETE','Know 200, 201, 400, 401, 404, 500','Nouns in URLs, JSON responses']],
git:['Both combine work from two branches. merge creates a merge commit and keeps the full history exactly as it happened. rebase moves your commits on top of the latest branch, giving a clean, linear history but rewriting commits, so never rebase shared branches. I merge for shared branches and rebase my own feature branch before opening a pull request.',['merge = keeps history','rebase = linear history','Never rebase shared branches']],
python:['A list is ordered and mutable, for example [1, 2, 3]. A tuple is ordered but immutable, for example (1, 2, 3), so it is safe for fixed data. A dictionary stores key–value pairs, for example {"name": "Ravi"}, with fast lookup by key.',['list = mutable','tuple = immutable','dict = key → value']],
java:['Encapsulation hides data using private fields with public getters and setters. Inheritance lets a child class reuse a parent class (Dog extends Animal). Polymorphism lets the same method behave differently through overriding or overloading. Abstraction hides complexity behind interfaces or abstract classes. Example: an Animal reference calling speak() runs Dog or Cat behaviour.',['4 pillars: encapsulation, inheritance, polymorphism, abstraction','One-line example for each']],
mongodb:['MongoDB is a good fit when data is flexible or changes often, is stored as JSON-like documents, or needs easy horizontal scaling, for example product catalogues or logs. SQL is better when data is highly relational and needs strict schemas, joins and transactions, for example banking.',['Flexible schema vs strict schema','Documents vs tables','Give one example for each']],
bootstrap:['Bootstrap uses a 12-column grid made of rows and columns. Classes like col-12 col-md-6 col-lg-4 change the column width at different screen breakpoints, so the layout stacks on mobile and spreads out on bigger screens without writing custom media queries.',['12-column grid','Breakpoints: sm, md, lg','Mobile-first']],
php:['HTTP is stateless, so PHP uses sessions to remember a user. session_start() creates a session ID; the data stays on the server while the browser keeps only the ID in a cookie. Cookies store small data in the browser itself. Sensitive data such as login state should stay in sessions, never in cookies.',['Session = server side','Cookie = browser side','Keep sensitive data in sessions']]};
function coachCtx(r,sk){const bul=(r.exp||'').split('\n').map(l=>l.replace(/^[-•\s]+/,'').trim()).filter(Boolean);
  return{name:r.name||'[Your name]',edu:r.edu||'a recent graduate',sk:sk.slice(0,5).join(', ')||'web development',s1:sk[0]||'a new tool',title:r.targetTitle||'developer',proj:bul[0]||'my final year project',b1:bul[1]||'',b2:bul[2]||''};}
const HA=[C=>[`Hello, I'm ${C.name}. ${C.edu}. I have hands-on skills in ${C.sk}. Recently I worked on ${C.proj}, where I learned to plan, build and test a complete solution. I'm now looking for a ${C.title} role where I can contribute to the team and keep growing.`,['Present: who you are now','Past: education + best project','Future: the role you want','Keep it under 90 seconds']],
 C=>[`You should hire me because I already have practical skills in ${C.sk}, and I have proved them by building ${C.proj}. I learn new tools quickly, I take ownership of my work and I communicate clearly with the team. I am ready to start contributing from day one.`,['2–3 skills that match the job','One proof: project or number','Attitude: learns fast, takes ownership']],
 C=>[`My biggest strength is problem solving and learning fast. For example, while building ${C.proj} I learned new tools on my own and delivered the work. A weakness I have is that I sometimes spend too much time perfecting small details. To improve, I now set a time limit for each task and finish the must-have features first.`,['Strength with a real example','Weakness that is real but not critical','Show how you are improving it']],
 C=>[`In five years I see myself as a skilled ${C.title}, with deeper knowledge of ${C.sk.split(', ').slice(0,3).join(', ')}. I want to own complete features end to end, keep learning new technologies and help newer team members grow.`,['Growth in the same field','Skills you will deepen','Contribution to the team, not just titles']],
 C=>[`This ${C.title} role matches my skills in ${C.sk} and my interest in building real products. I want to apply what I learned in ${C.proj} in a real team environment and grow together with the company.`,['Link role → your skills','Show you know the company/work','Say what you want to learn']]];
const BA=[C=>[`Situation: In ${C.proj}, two of us disagreed on how to structure a feature.\nTask: We had to finish on time without hurting team spirit.\nAction: I listened to both ideas, suggested we compare them with a small test, and we picked the simpler one that met the requirement.\nResult: We finished on schedule and the team kept working well. I learned to settle disagreements with facts, not opinions.`,['Use STAR: Situation, Task, Action, Result','Focus on what YOU did','End with a lesson']],
 C=>[`Situation: For ${C.proj} I needed ${C.s1}, which I had not used deeply.\nTask: Learn it fast enough to deliver on time.\nAction: I read the official documentation, built a small demo first, then added it to the project step by step and asked for help when stuck.\nResult: I delivered the feature on time and can now use ${C.s1} confidently.`,['Name the skill','Show your learning method','Result + confidence gained']],
 C=>[`Situation: Close to the submission of ${C.proj}, several features were still pending.\nTask: Deliver a working version on time.\nAction: I listed tasks by priority, finished the must-have features first, tested daily and told my guide about the risk early.\nResult: I submitted a stable version on time and moved the extra features to a later update. Now I always plan with buffer time.`,['Be honest','Prioritise + communicate early','Show what you changed after']]];
let coachQs=[],coachRow=null;
async function renderCoach(){
  const{data}=await supabaseClient.from('resumes').select('id,title').eq('user_id',currentUser.id);
  $('page-coach').innerHTML=`<h2>Interview Coach</h2><p style="color:var(--muted)">Practice questions built from your own resume. Type your answer and get instant feedback — free and unlimited.</p>
  <div class="card2"><label>Practice using resume</label><select class="v2-input" id="co_res">${(data||[]).map(r=>`<option value="${r.id}">${esc(r.title)}</option>`).join('')}</select>
  <button class="btn-ai" onclick="coachGenerate()">Generate Questions</button></div><div class="an-grid"><div id="co_list"></div><div class="card2" id="co_prac"><div class="an-empty"><div style="font-size:44px">🎤</div><h3>Pick a question</h3><p>Choose a question on the left to practise your answer.</p></div></div></div>`;
  if(data&&data.length)coachGenerate();else $('co_list').innerHTML='<div class="card2">Create a resume first, then come back to practise.</div>';
}
async function coachGenerate(){
  const id=$('co_res').value;if(!id)return;
  const{data}=await supabaseClient.from('resumes').select('*').eq('id',id).eq('user_id',currentUser.id).single();
  coachRow=rowToState(data);const r=coachRow,sk=(r.skills||[]).slice(0,6),C=coachCtx(r,sk);
  coachQs=[...HR.map((x,i)=>{const a=HA[i](C);return{c:'HR',q:x[0],tip:x[1],a:a[0],k:a[1]};}),...BEH.map((x,i)=>{const a=BA[i](C);return{c:'Behavioral',q:x[0],tip:x[1],a:a[0],k:a[1]};})];
  sk.forEach(s=>{const t=TA[s.toLowerCase()];coachQs.push({c:'Technical',q:QB[s.toLowerCase()]||`Tell me about a project where you used ${s}. Why did you choose it?`,tip:'Define it simply, give an example, mention where you used it.',kw:[s.toLowerCase()],
    a:t?t[0]:`I used ${s} in ${C.proj}. I chose it because it fits the requirement and is widely used in industry. I used it for the main features, tested them step by step, and the result was a working, stable application.`,k:t?t[1]:['Define it in one line','Why you chose it','One feature you built','Result']});});
  if(C.proj)coachQs.push({c:'Project',q:`Walk me through "${C.proj.slice(0,70)}". What was your role and the biggest challenge?`,tip:'Problem → your role → tech used → result with a number.',a:`${C.proj}. My role: I designed and developed the main features.\nTech used: ${C.sk}.\nChallenge: ${C.b1||'connecting the frontend with the database and keeping data secure'}, which I solved by testing step by step and reading documentation.\nResult: ${C.b2||'a working application that met all requirements'}.`,k:['Problem','Your role','Tech used','Challenge + result']});
  coachQs.push({c:'Project',q:'How did you measure the success of your project? Give numbers.',tip:'Use a metric: users, % faster, bugs fixed, time saved.',a:`I measured success with numbers. ${[C.b1,C.b2].filter(x=>/\d/.test(x)).join(' ')||'For example, load time improved by 30% and 100+ test records were handled without errors.'} I also collected feedback from teammates and fixed the issues, which made the final version more stable.`,k:['Always include a number','Speed, users, errors, time saved','Mention feedback']});
  $('co_list').innerHTML=['HR','Behavioral','Technical','Project'].map(c=>`<div class="card2"><h3>${c}</h3>${coachQs.map((x,i)=>x.c===c?`<div class="co-q" onclick="coachOpen(${i})">${esc(x.q)}</div>`:'').join('')}</div>`).join('');
}
function coachOpen(i){
  const x=coachQs[i];
  $('co_prac').innerHTML=`<span class="chip2">${x.c}</span><h3>${esc(x.q)}</h3><p style="color:var(--muted)">💡 ${esc(x.tip)}</p>
  <textarea class="v2-input" id="co_ans" rows="9" placeholder="Type your answer as you would say it in the interview…"></textarea>
  <div class="row-actions"><button class="btn-p" onclick="coachEval(${i})">Evaluate my answer</button><button class="btn-o" onclick="coachModel(${i})">📖 Teach me the answer</button></div><div id="co_teach"></div><div id="co_fb"></div>`;
}
function coachModel(i){const x=coachQs[i];
  $('co_teach').innerHTML=`<div class="card2" style="background:#EEF2FF"><b>📖 Model answer</b><p>${esc(x.a).replace(/\n/g,'<br>')}</p><b>Key points to remember</b><ul>${(x.k||[]).map(p=>`<li>${esc(p)}</li>`).join('')}</ul><small>Don't memorise word-for-word — understand it, then say it in your own words.</small></div>`;}
function coachEval(i){
  const x=coachQs[i],t=($('co_ans').value||'').trim();if(!t)return toast('Type your answer first','err');
  const w=t.split(/\s+/).length,low=t.toLowerCase(),has=re=>re.test(low);
  const verbs=(low.match(/\b(built|developed|designed|implemented|created|led|fixed|solved|learned|managed|improved|tested|deployed|analy[sz]ed)\b/g)||[]).length;
  const nums=(t.match(/\d+%?/g)||[]).length,fill=(low.match(/\b(um+|uh+|basically|actually|you know|kind of|sort of)\b/g)||[]);
  const rel=(x.kw||[]).length?(x.kw.some(k=>low.includes(k))?15:0):(has(/\b(i|my|me)\b/)?15:5);
  const sc={Length:w<30?6:w<60?16:w<=200?25:18,'Action verbs':Math.min(20,verbs*5),Results:Math.min(25,nums*8+(has(/result|improv|reduc|increas|achiev/)?9:0)),Relevance:rel,Clarity:Math.max(0,15-fill.length*4)};
  const tot=Object.values(sc).reduce((a,b)=>a+b,0),max={Length:25,'Action verbs':20,Results:25,Relevance:15,Clarity:15},tips=[];
  if(w<60)tips.push(`Your answer is short (${w} words). Aim for 60–200 words.`);if(w>200)tips.push('Too long — trim to the key points (under ~200 words).');
  if(verbs<2)tips.push('Use more action verbs: built, developed, implemented, fixed.');
  if(!nums)tips.push('Add a number or result (e.g., "reduced load time by 30%").');
  if(fill.length)tips.push(`Remove filler words: ${[...new Set(fill)].join(', ')}.`);
  if(x.c==='Behavioral'&&!has(/situation|task|when|during|result/))tips.push('Follow STAR: Situation, Task, Action, Result.');
  if(x.kw&&!x.kw.some(k=>low.includes(k)))tips.push(`Mention "${x.kw[0]}" directly in your answer.`);
  if(!tips.length)tips.push('Great answer! Practise saying it aloud in under 90 seconds.');
  $('co_fb').innerHTML=`<div class="card2"><div style="font-size:30px;font-weight:800">${tot}/100 <span style="font-size:14px;color:var(--muted)">${tot>=75?'Strong':tot>=50?'Good, can improve':'Needs work'}</span></div>${Object.keys(sc).map(k=>`<div style="font-size:13px">${k} — ${sc[k]}/${max[k]}</div><div class="bar"><i style="width:${sc[k]/max[k]*100}%"></i></div>`).join('')}<ul>${tips.map(z=>`<li>${esc(z)}</li>`).join('')}</ul></div>`;
}

/* ---------- Applications tracker ---------- */
async function renderApplications(){
  const{data,error}=await supabaseClient.from('applications').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false});
  if(error)toast('Could not load applications','err');
  const ST=['Applied','Interview','Selected','Rejected'];
  $('page-applications').innerHTML=`<h2>Job Applications</h2><div class="card2"><div class="grid3"><div><label>Company</label><input class="v2-input" id="ap_co"></div><div><label>Role</label><input class="v2-input" id="ap_role"></div><div><label>Applied date</label><input type="date" class="v2-input" id="ap_date"></div>
  <div><label>Status</label><select class="v2-input" id="ap_st">${ST.map(s=>`<option>${s}</option>`).join('')}</select></div><div><label>Interview date</label><input type="date" class="v2-input" id="ap_int"></div><div><label>Result</label><input class="v2-input" id="ap_res"></div></div><button class="btn-p" onclick="addApplication()">+ Add Application</button></div>
  ${(data||[]).map(a=>`<div class="card2"><b>${esc(a.role)}</b> @ ${esc(a.company)} <span class="chip2">${esc(a.status)}</span><div style="color:var(--muted);font-size:13px">Applied ${esc(a.applied_date||'—')} · Interview ${esc(a.interview_date||'—')} ${esc(a.result)}</div>
  <div class="row-actions">${ST.map(s=>`<button class="btn-o" onclick="setAppStatus('${a.id}','${s}')">${s}</button>`).join('')}<button class="btn-o" onclick="delApplication('${a.id}')">Delete</button></div></div>`).join('')||'<div class="card2">No applications tracked yet.</div>'}`;
}
async function addApplication(){
  const company=$('ap_co').value.trim(),role=$('ap_role').value.trim();
  if(!company||!role)return toast('Company and role are required','err');
  const{error}=await supabaseClient.from('applications').insert({user_id:currentUser.id,company,role,applied_date:$('ap_date').value||null,status:$('ap_st').value,interview_date:$('ap_int').value||null,result:$('ap_res').value});
  error?toast('Could not save application','err'):(toast('Application added','ok'),renderApplications());
}
async function setAppStatus(id,status){const{error}=await supabaseClient.from('applications').update({status}).eq('id',id).eq('user_id',currentUser.id);error?toast('Update failed','err'):renderApplications();}
async function delApplication(id){const{error}=await supabaseClient.from('applications').delete().eq('id',id).eq('user_id',currentUser.id);error?toast('Delete failed','err'):renderApplications();}

/* ---------- Support center ---------- */
function renderSupport(){
  const faq=[['Resume Builder Issues','Refresh and log in again, check required fields, check your connection.'],['PDF Download Issues','Allow downloads in your browser, try another page size, disable blockers.'],['Login Issues','Confirm your email if required, reset your password, clear cache.'],['ATS Analysis Issues','Make sure the resume has content; paste a full job description.']];
  $('page-support').innerHTML=`<h2>Support Center</h2><div class="grid3" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))"><div class="card2"><h3>Submit Support Ticket</h3><label>Subject *</label><input class="v2-input" id="sp_sub" maxlength="200"><label>Description *</label><textarea class="v2-input" id="sp_desc" rows="6"></textarea><button class="btn-p" onclick="submitTicket()">Submit</button></div>
  <div class="card2"><h3>Common Issues & Solutions</h3>${faq.map(f=>`<p><b>${f[0]}</b><br><span style="color:var(--muted)">${f[1]}</span></p>`).join('')}</div></div>`;
}
async function submitTicket(){
  const subject=$('sp_sub').value.trim(),description=$('sp_desc').value.trim();
  if(!subject||!description)return toast('Subject and description are required','err');
  const{error}=await supabaseClient.from('support_tickets').insert({user_id:currentUser.id,subject,description});
  error?toast('Could not submit ticket','err'):(toast('Ticket submitted','ok'),$('sp_sub').value=$('sp_desc').value='');
}

/* ---------- AI generators: free, with sensible fallbacks ---------- */
(function(){const _g=generateSummary,_r=rewriteExperience;
  generateSummary=function(){const t=$('f_title');if(t&&!t.value.trim())t.value='Full Stack Developer';_g();};
  rewriteExperience=function(){const e=$('f_exp');if(e&&!e.value.trim())e.value='Built and maintained web applications\nWorked with a team to deliver features on time';_r();};
})();

function fullPreview(){
  renderPreview();const old=$('fpModal');if(old)old.remove();
  const m=document.createElement('div');m.className='modal-bg';m.id='fpModal';
  m.innerHTML='<div class="fp-box"><button class="btn-o fp-x" onclick="document.getElementById(\'fpModal\').remove()">✕ Close</button><div class="fp-body">'+$('previewWrap').outerHTML.replace(/ id="[^"]*"/g,'')+'</div></div>';
  document.body.appendChild(m);m.addEventListener('click',e=>{if(e.target===m)m.remove();});
}

/* ---------- Live job matching on the same page ---------- */
renderJobSearchLinks=function(){
  const row=document.getElementById('jobSearchRow');if(!row)return;
  if(!row.querySelector('.jm-shell'))row.innerHTML='<div class="jm-shell"><button class="btn-p" id="jm_btn" onclick="findJobs()">🔍 Analyze resume &amp; find jobs</button><div id="jm_out"></div><div class="jm-more" id="jm_more"></div></div>';
  const t=($('f_title').value||'').trim(),q=encodeURIComponent([t,skills.slice(0,3).join(' ')].filter(Boolean).join(' ')),loc=encodeURIComponent(($('f_location').value||'').trim());
  $('jm_more').innerHTML='More boards: '+[['LinkedIn','https://www.linkedin.com/jobs/search/?keywords='+q+'&location='+loc],['Indeed','https://www.indeed.com/jobs?q='+q+'&l='+loc],['Naukri','https://www.naukri.com/'+encodeURIComponent((t||'jobs').toLowerCase().replace(/\s+/g,'-'))+'-jobs']].map(b=>`<a href="${b[1]}" target="_blank" rel="noopener">${b[0]} ↗</a>`).join(' · ');
};
async function findJobs(){
  const out=$('jm_out'),btn=$('jm_btn');if(!out)return;
  const title=($('f_title').value||'').trim(),kw=[...new Set(skills.map(s=>s.toLowerCase().trim()).filter(Boolean))];
  if(!title&&!kw.length){out.innerHTML='<div class="jm-note">Add a target title or some skills first.</div>';return;}
  btn.disabled=true;out.innerHTML='<div class="jm-note">Analyzing your resume and searching live jobs…</div>';
  const clean=x=>(x||'').replace(/<[^>]+>/g,' ').slice(0,1500);
  const get=async(u,map)=>{try{const r=await fetch(u);if(!r.ok)throw 0;return map(await r.json());}catch(e){return null;}};
  const q=encodeURIComponent(title||kw.slice(0,2).join(' '));
  const [a,b]=await Promise.all([
    get('https://remotive.com/api/remote-jobs?search='+q+'&limit=40',j=>(j.jobs||[]).map(x=>({t:x.title,c:x.company_name,l:x.candidate_required_location||'Remote',u:x.url,g:(x.tags||[]).join(' '),d:clean(x.description),s:'Remotive'}))),
    get('https://www.arbeitnow.com/api/job-board-api',j=>(j.data||[]).map(x=>({t:x.title,c:x.company_name,l:x.location||(x.remote?'Remote':''),u:x.url,g:(x.tags||[]).join(' '),d:clean(x.description),s:'Arbeitnow'})))
  ]);
  btn.disabled=false;
  if(a===null&&b===null){out.innerHTML='<div class="jm-note">Could not reach the job feeds (check internet / browser blocking). Try again, or use the boards below.</div>';return;}
  const words=title.toLowerCase().split(/\s+/).filter(w=>w.length>2&&!['and','the','for'].includes(w));
  const jobs=[...(a||[]),...(b||[])].map(j=>{
    const hay=(j.t+' '+j.g+' '+j.d).toLowerCase(),hit=kw.filter(k=>hay.includes(k)),tm=words.length&&words.some(w=>j.t.toLowerCase().includes(w));
    return{...j,hit,pct:Math.min(100,Math.round(hit.length/Math.max(1,Math.min(kw.length,6))*80)+(tm?20:0)),tm};
  }).filter(j=>j.hit.length>=2||j.tm&&j.hit.length>=1).sort((x,y)=>y.pct-x.pct).slice(0,12);
  out.innerHTML=jobs.length?`<div class="jm-note">${jobs.length} live jobs matched to <b>${esc(title||'your skills')}</b> · ${kw.length} skills analysed</div>`+jobs.map(j=>`<div class="jm-card"><div class="jm-pct ${j.pct>=70?'hi':j.pct>=40?'mid':'lo'}">${j.pct}%<small>match</small></div><div class="jm-main"><div class="jm-t">${esc(j.t)}</div><div class="jm-c">${esc(j.c)} · ${esc(j.l)} · <span>${j.s}</span></div><div>${j.hit.slice(0,6).map(k=>`<span class="chip2">${esc(k)}</span>`).join('')}</div></div><a class="btn-o" href="${esc(j.u)}" target="_blank" rel="noopener">Apply ↗</a></div>`).join(''):'<div class="jm-note">No close matches right now. Try adding more skills or a broader target title, then search again.</div>';
}
(function(){const _rs=runScan;runScan=function(){_rs();setTimeout(()=>{if($('jm_btn'))findJobs();},1200);};})();
