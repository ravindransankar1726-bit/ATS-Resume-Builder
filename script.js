/* ============================================================
   SUPABASE SETUP
   ============================================================ */
const SUPABASE_URL = 'https://oylvdrtqadlirkavpurq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0yrfHi5Lrt75HndRXHF-OQ_tDkZN4VT';
let supabaseClient = null;
try{
  if(!window.supabase) throw new Error('Supabase library did not load from CDN — check your internet connection or the script tag in index.html.');
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch(e){
  console.error(e);
  alert('Could not connect to Supabase: ' + e.message + '\n\nAuth and saving will not work until this is fixed, but the rest of the app will still load.');
}

/* ============================================================
   AUTH
   ============================================================ */
let authMode = 'login';
let currentUser = null; // {id, email, name}

// Restore session on page load (so refreshing doesn't log you out)
applyDarkModePreference();

(async function initSession(){
  if(!supabaseClient) return;
  const isPublic = await checkPublicShareView();
  if(isPublic) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(session && session.user){
    currentUser = {
      id: session.user.id,
      email: session.user.email,
      name: (session.user.user_metadata && session.user.user_metadata.name) || session.user.email.split('@')[0]
    };
    document.getElementById('page-auth').style.display = 'none';
    document.getElementById('page-app').style.display = 'block';
    updateSidebarUser();
    goToDashboard();
  }
})();

function updateSidebarUser(){
  if(!currentUser) return;
  document.getElementById('sidebarUserName').textContent = currentUser.name || currentUser.email;
  document.getElementById('sidebarAvatar').textContent = (currentUser.name || currentUser.email || 'U').charAt(0).toUpperCase();
}

function switchAuthTab(mode){
  authMode = mode;
  document.getElementById('tabLogin').classList.toggle('active', mode==='login');
  document.getElementById('tabSignup').classList.toggle('active', mode==='signup');
  document.getElementById('signupNameWrap').style.display = mode==='signup' ? 'block' : 'none';
  document.getElementById('authSubmitBtn').textContent = mode==='signup' ? 'Sign up' : 'Log in';
  document.getElementById('authError').style.display = 'none';
}

async function handleAuthSubmit(){
  if(!supabaseClient){ alert('Supabase is not connected — check the console for details.'); return; }
  const email = document.getElementById('auth_email').value.trim().toLowerCase();
  const password = document.getElementById('auth_password').value;
  const errEl = document.getElementById('authError');
  errEl.style.display = 'none';
  if(!email || !password){ errEl.textContent = 'Enter email and password.'; errEl.style.display='block'; return; }

  try{
    if(authMode === 'signup'){
      const name = document.getElementById('auth_name').value.trim() || 'User';
      const { data, error } = await supabaseClient.auth.signUp({
        email, password, options: { data: { name } }
      });
      if(error){ errEl.textContent = error.message; errEl.style.display='block'; return; }
      if(data.user && !data.session){
        errEl.style.display='block'; errEl.style.color = '#6FAE1E';
        errEl.textContent = 'Account created! Check your email to confirm, then log in.';
        return;
      }
      currentUser = { id: data.user.id, email: data.user.email, name };
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if(error){ errEl.textContent = error.message; errEl.style.display='block'; return; }
      currentUser = {
        id: data.user.id, email: data.user.email,
        name: (data.user.user_metadata && data.user.user_metadata.name) || data.user.email.split('@')[0]
      };
    }
    document.getElementById('page-auth').style.display = 'none';
    document.getElementById('page-app').style.display = 'block';
    updateSidebarUser();
    goToDashboard();
  } catch(err){
    console.error(err);
    errEl.textContent = 'Something went wrong. Please try again.';
    errEl.style.display = 'block';
  }
}

async function logout(){
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentResumeId = null;
  document.getElementById('page-app').style.display = 'none';
  document.getElementById('page-auth').style.display = 'block';
  document.getElementById('auth_password').value = '';
}

/* ============================================================
   DASHBOARD + RESUME PERSISTENCE
   ============================================================ */
let currentResumeId = null;
let autosaveTimer = null;

function defaultResumeState(id, title){
  return {
    id, title: title || 'Untitled Resume', template: 'tpl-ats',
    name: 'Ravindran S', targetTitle: 'Frontend Developer',
    email: 'ravindran@email.com', phone: '+91 00000 00000', location: 'Chennai, India',
    linkedin: 'linkedin.com/in/ravindran', github: 'github.com/ravindran',
    summary: 'BCA student with hands-on experience building web applications using HTML, CSS, JavaScript and modern APIs. Interested in frontend development roles.',
    skills: ['HTML','CSS','JavaScript'],
    exp: 'Created a resume builder website using HTML, CSS and JavaScript. Added login feature for users.',
    edu: 'BCA, L.N. Government College (Autonomous), Ponneri — 2024–2027',
    certs: 'Full-Stack Web Development — Coursera (2025)\nResponsive Web Design — freeCodeCamp (2024)',
    achievements: 'Winner, college-level hackathon (2025)\nBuilt and deployed 3 personal web projects',
    languages: 'English, Tamil',
    jd: 'We are hiring a Frontend Developer with strong skills in React, JavaScript, HTML, CSS, Git, and REST APIs. Experience with responsive design, Tailwind CSS, and version control is required.',
    company: '',
    atsScore: null, updatedAt: Date.now()
  };
}

// Map a Supabase `resumes` row -> the in-memory state shape the builder UI uses
function rowToState(row){
  return {
    id: row.id, title: row.title, template: row.template,
    name: row.name, targetTitle: row.target_title,
    email: row.email, phone: row.phone, location: row.location,
    linkedin: row.linkedin, github: row.github,
    summary: row.summary, skills: row.skills || [],
    exp: row.experience, edu: row.education, jd: row.job_description,
    certs: row.certifications, achievements: row.achievements, internships: row.internships, hobbies: row.hobbies, languages: row.languages,
    company: row.company,
    atsScore: row.ats_score, updatedAt: new Date(row.updated_at).getTime()
  };
}

const APP_PAGES = ['page-dashboard','page-account','page-builder','page-feedback'];
const SIDEBAR_LINKS = ['sidebarDashLink','sidebarAccountLink','sidebarBuilderLink','sidebarFeedbackLink'];

function showAppPage(pageId){
  APP_PAGES.forEach(p => document.getElementById(p).style.display = (p===pageId) ? 'block' : 'none');
}
function setSidebarActive(linkId){
  SIDEBAR_LINKS.forEach(l => document.getElementById(l).classList.toggle('active', l===linkId));
  document.getElementById('sidebarBuilderLink').style.display = (linkId==='sidebarBuilderLink') ? 'flex' : 'none';
}

function showSidebarBuilderTab(){ setSidebarActive('sidebarBuilderLink'); }

async function goToDashboard(){
  showAppPage('page-dashboard');
  setSidebarActive('sidebarDashLink');
  document.getElementById('dashGreeting').textContent = `Welcome, ${currentUser.name} 👋`;
  await loadResumeList();
  loadDashboardStats();
}

async function loadDashboardStats(){
  const statRow = document.getElementById('statRow');
  try{
    const { data: resumes, error } = await supabaseClient.from('resumes').select('ats_score').eq('user_id', currentUser.id);
    if(error) throw error;
    const scores = (resumes || []).map(r => r.ats_score).filter(s => s != null);
    const bestScore = scores.length ? Math.max(...scores) : null;
    const avgScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
    statRow.innerHTML = `
      <div class="stat-card"><div class="stat-icon">📄</div><div><div class="stat-num">${(resumes||[]).length}</div><div class="stat-label">Total Resumes</div></div></div>
      <div class="stat-card"><div class="stat-icon">🏆</div><div><div class="stat-num">${bestScore != null ? bestScore : '—'}</div><div class="stat-label">Best ATS Score</div></div></div>
      <div class="stat-card"><div class="stat-icon">📊</div><div><div class="stat-num">${avgScore != null ? avgScore : '—'}</div><div class="stat-label">Average ATS Score</div></div></div>
    `;
  } catch(err){
    console.error(err);
    statRow.innerHTML = '';
  }
}

async function loadResumeList(){
  const grid = document.getElementById('resumeGrid');
  grid.innerHTML = `<div class="empty-dash">Loading your resumes…</div>`;
  try{
    const { data, error } = await supabaseClient
      .from('resumes')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('updated_at', { ascending: false });
    if(error) throw error;
    if(!data.length){
      grid.innerHTML = `<div class="empty-dash">No resumes yet — click "+ New Resume" to start your first one.</div>`;
      return;
    }
    const items = data.map(rowToState);
    grid.innerHTML = items.map(it => `
      <div class="resume-card" onclick="openResume('${it.id}')">
        <button class="rc-delete" onclick="event.stopPropagation(); deleteResume('${it.id}')">✕ Delete</button>
        <p class="rc-title">${escapeHtml(it.title)}</p>
        <div class="rc-meta">Updated ${new Date(it.updatedAt).toLocaleDateString()}</div>
        ${it.atsScore!=null ? `<span class="rc-score">ATS ${it.atsScore}/100</span>` : `<span class="rc-score" style="color:var(--ink-lo);background:none;">Not scanned yet</span>`}
      </div>
    `).join('');
  } catch(err){
    console.error(err);
    grid.innerHTML = `<div class="empty-dash">Couldn't load resumes. Try refreshing.</div>`;
  }
}

function escapeHtml(s){ const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function createNewResume(){
  const state = defaultResumeState(null, 'Untitled Resume');
  const { data, error } = await supabaseClient.from('resumes').insert({
    user_id: currentUser.id,
    title: state.title, template: state.template,
    name: state.name, target_title: state.targetTitle,
    email: state.email, phone: state.phone, location: state.location,
    linkedin: state.linkedin, github: state.github,
    summary: state.summary, skills: state.skills,
    experience: state.exp, education: state.edu, job_description: state.jd
  }).select().single();
  if(error){ console.error(error); alert('Could not create resume: '+error.message); return; }
  openResume(data.id);
}

async function deleteResume(id){
  if(!confirm('Delete this resume? This cannot be undone.')) return;
  const { error } = await supabaseClient.from('resumes').delete().eq('id', id).eq('user_id', currentUser.id);
  if(error) console.error(error);
  loadResumeList();
}

/* ============================================================
   SETTINGS
   ============================================================ */
function goToAccount(){
  showAppPage('page-account');
  setSidebarActive('sidebarAccountLink');
  document.getElementById('account_name').value = currentUser.name || '';
  document.getElementById('account_email').value = currentUser.email || '';
  document.getElementById('accountSaveMsg').textContent = '';
}

async function updateAccountName(){
  const name = document.getElementById('account_name').value.trim();
  const msg = document.getElementById('accountSaveMsg');
  if(!name){ msg.textContent = 'Name cannot be empty.'; msg.style.color = 'var(--coral)'; return; }
  const { error } = await supabaseClient.auth.updateUser({ data: { name } });
  if(error){ msg.textContent = error.message; msg.style.color = 'var(--coral)'; return; }
  currentUser.name = name;
  document.getElementById('sidebarUserName').textContent = name;
  document.getElementById('sidebarAvatar').textContent = name.charAt(0).toUpperCase();
  msg.textContent = 'Saved ✓';
  msg.style.color = '#6FAE1E';
}

/* ============================================================
   APP FEEDBACK
   ============================================================ */
let feedbackRating = 0;

function goToFeedback(){
  showAppPage('page-feedback');
  setSidebarActive('sidebarFeedbackLink');
  feedbackRating = 0;
  renderFeedbackStars();
  document.getElementById('feedbackComment').value = '';
  document.getElementById('feedbackMsg').textContent = '';
  loadFeedbackHistory();
}

function setFeedbackStars(n){
  feedbackRating = n;
  renderFeedbackStars();
}

function renderFeedbackStars(){
  document.querySelectorAll('#feedbackStars .star-btn').forEach(btn=>{
    btn.classList.toggle('filled', parseInt(btn.dataset.val) <= feedbackRating);
  });
}

async function submitFeedback(){
  const msg = document.getElementById('feedbackMsg');
  const comment = document.getElementById('feedbackComment').value.trim();
  if(feedbackRating === 0){ msg.textContent = 'Pick a star rating first.'; msg.style.color = 'var(--coral)'; return; }
  msg.textContent = 'Sending…'; msg.style.color = 'var(--ink-dim)';
  try{
    const { error } = await supabaseClient.from('feedback').insert({
      user_id: currentUser.id, rating: feedbackRating, comment
    });
    if(error) throw error;
    msg.textContent = 'Thanks for the feedback! ✓';
    msg.style.color = '#6FAE1E';
    feedbackRating = 0;
    renderFeedbackStars();
    document.getElementById('feedbackComment').value = '';
    loadFeedbackHistory();
  } catch(e){
    msg.textContent = 'Could not send feedback — ' + (e.message || 'try again later.');
    msg.style.color = 'var(--coral)';
  }
}

async function loadFeedbackHistory(){
  const host = document.getElementById('feedbackHistory');
  try{
    const { data, error } = await supabaseClient.from('feedback')
      .select('rating,comment,created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if(error) throw error;
    if(!data || !data.length){ host.innerHTML = '<p class="sub">No feedback submitted yet.</p>'; return; }
    host.innerHTML = data.map(f => `
      <div class="feedback-history-item">
        <div class="fh-stars">${'★'.repeat(f.rating)}${'☆'.repeat(5-f.rating)}</div>
        ${f.comment ? `<div class="fh-comment">${escapeHtml(f.comment)}</div>` : ''}
        <div class="fh-date">${new Date(f.created_at).toLocaleDateString()}</div>
      </div>`).join('');
  } catch(e){
    host.innerHTML = '<p class="sub">Couldn\'t load your past feedback right now.</p>';
  }
}

async function openResume(id){
  currentResumeId = id;
  let state;
  try{
    const { data, error } = await supabaseClient.from('resumes').select('*').eq('id', id).eq('user_id', currentUser.id).single();
    if(error) throw error;
    state = rowToState(data);
  } catch(e){
    console.error(e);
    state = defaultResumeState(id);
  }
  loadStateIntoBuilder(state);
  showAppPage('page-builder');
  setSidebarActive('sidebarBuilderLink');
  document.getElementById('saveIndicator').textContent = 'Loaded';
  document.getElementById('saveIndicator').classList.remove('saved');
}

function loadStateIntoBuilder(state){
  document.getElementById('resumeNameInput').value = state.title;
  document.getElementById('f_name').value = state.name;
  document.getElementById('f_title').value = state.targetTitle;
  document.getElementById('f_email').value = state.email || '';
  document.getElementById('f_phone').value = state.phone || '';
  document.getElementById('f_location').value = state.location || '';
  document.getElementById('f_linkedin').value = state.linkedin || '';
  document.getElementById('f_github').value = state.github || '';
  document.getElementById('f_summary').value = state.summary;
  document.getElementById('f_exp').value = state.exp;
  document.getElementById('f_edu').value = state.edu;
  document.getElementById('f_certs').value = state.certs || '';
  document.getElementById('f_achievements').value = state.achievements || '';
  document.getElementById('f_internships').value = state.internships || '';
  document.getElementById('f_hobbies').value = state.hobbies || '';
  document.getElementById('f_languages').value = state.languages || '';
  document.getElementById('f_jd').value = state.jd;
  skills = (state.skills || []).slice();
  setTemplate(state.template || 'tpl-ats', false);
  lastAnalysis = null;
  hasScanned = false;
  document.getElementById('inputStage').style.display = 'grid';
  document.getElementById('resultsWrapper').style.display = 'none';
  const downloadBtn = document.getElementById('downloadBtn');
  if(downloadBtn) downloadBtn.disabled = true;
  const historyBtn = document.getElementById('historyBtn');
  if(historyBtn) historyBtn.disabled = true;
  const shareBtn = document.getElementById('shareBtn');
  if(shareBtn) shareBtn.disabled = true;
  document.getElementById('shareToggle').checked = false;
  document.getElementById('shareLinkBox').style.display = 'none';
  document.getElementById('analysisBody').innerHTML = `<div class="empty-state"><span class="big">◎</span>Run a scan to see your<br/>ATS score & suggestions</div>`;
  setWorkflowStep(2);
  renderSkillTags();
}

function scheduleAutosave(){
  document.getElementById('saveIndicator').textContent = 'Saving…';
  document.getElementById('saveIndicator').classList.remove('saved');
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveCurrentResume, 900);
}

async function saveCurrentResume(){
  if(!currentResumeId || !currentUser) return;
  const payload = {
    title: document.getElementById('resumeNameInput').value || 'Untitled Resume',
    template: currentTemplate,
    name: document.getElementById('f_name').value,
    target_title: document.getElementById('f_title').value,
    email: document.getElementById('f_email').value,
    phone: document.getElementById('f_phone').value,
    location: document.getElementById('f_location').value,
    linkedin: document.getElementById('f_linkedin').value,
    github: document.getElementById('f_github').value,
    summary: document.getElementById('f_summary').value,
    skills: skills,
    experience: document.getElementById('f_exp').value,
    education: document.getElementById('f_edu').value,
    certifications: document.getElementById('f_certs').value,
    achievements: document.getElementById('f_achievements').value,
    internships: document.getElementById('f_internships').value,
    hobbies: document.getElementById('f_hobbies').value,
    languages: document.getElementById('f_languages').value,
    job_description: document.getElementById('f_jd').value,
    ats_score: lastAnalysis ? lastAnalysis.ats_score : null
  };
  try{
    const { error } = await supabaseClient.from('resumes').update(payload).eq('id', currentResumeId).eq('user_id', currentUser.id);
    if(error) throw error;
    document.getElementById('saveIndicator').textContent = 'Saved ✓';
    document.getElementById('saveIndicator').classList.add('saved');
  }catch(e){
    console.error(e);
    document.getElementById('saveIndicator').textContent = 'Save failed';
  }
}

/* ============================================================
   TEMPLATES
   ============================================================ */
const TEMPLATES = [
  {id:'tpl-ats', label:'ATS-Friendly'},
  {id:'tpl-modern', label:'Modern'},
  {id:'tpl-minimal', label:'Minimal'},
  {id:'tpl-developer', label:'Developer'}
];
let currentTemplate = 'tpl-ats';

function renderTplRow(){
  const row = document.getElementById('tplRow');
  row.innerHTML = TEMPLATES.map(t => `<button class="tpl-chip ${t.id===currentTemplate?'active':''}" onclick="setTemplate('${t.id}')">${t.label}</button>`).join('');
}

/* ============================================================
   REAL-TIME JOB SEARCH — deep links to live job boards
   (no API key required; opens actual current listings)
   ============================================================ */
function renderJobSearchLinks(){
  const row = document.getElementById('jobSearchRow');
  if(!row) return;
  const title = (document.getElementById('f_title').value || '').trim();
  const topSkills = skills.slice(0,3).join(' ');
  const location = (document.getElementById('f_location').value || '').trim();
  const q = encodeURIComponent([title, topSkills].filter(Boolean).join(' '));
  const loc = encodeURIComponent(location || '');

  const boards = [
    { label:'🔗 LinkedIn Jobs', url:`https://www.linkedin.com/jobs/search/?keywords=${q}&location=${loc}` },
    { label:'🔗 Indeed', url:`https://www.indeed.com/jobs?q=${q}&l=${loc}` },
    { label:'🔗 Naukri', url:`https://www.naukri.com/${encodeURIComponent((title||'jobs').toLowerCase().replace(/\s+/g,'-'))}-jobs` },
    { label:'🔗 Google Jobs', url:`https://www.google.com/search?q=${q}+jobs+${loc}&ibp=htl;jobs` }
  ];
  row.innerHTML = boards.map(b => `<a class="job-search-btn" href="${b.url}" target="_blank" rel="noopener">${b.label}</a>`).join('');
}
function setTemplate(id, doSave){
  currentTemplate = id;
  const wrap = document.getElementById('previewWrap');
  TEMPLATES.forEach(t => wrap.classList.remove(t.id));
  wrap.classList.add(id);
  document.getElementById('previewWrap').querySelector('.r-header').style.display = id==='tpl-modern' ? 'block' : 'none';
  renderTplRow();
  if(doSave !== false) scheduleAutosave();
}

let dlFormat = 'pdf';
let dlPageSize = 'a4';
let dlMargin = 10;

function closeOtherPanels(exceptId){
  ['historyPanel','sharePanel','downloadPanel'].forEach(id=>{
    if(id !== exceptId) document.getElementById(id).style.display = 'none';
  });
}

function toggleDownloadPanel(){
  closeOtherPanels('downloadPanel');
  const panel = document.getElementById('downloadPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', (e)=>{
  [
    ['downloadPanel','downloadBtn'],
    ['historyPanel','historyBtn'],
    ['sharePanel','shareBtn']
  ].forEach(([panelId, btnId])=>{
    const panel = document.getElementById(panelId);
    const btn = document.getElementById(btnId);
    if(panel && panel.style.display !== 'none' && !panel.contains(e.target) && e.target !== btn){
      panel.style.display = 'none';
    }
  });
});

function setDlFormat(fmt){
  dlFormat = fmt;
  document.querySelectorAll('#fmtOptions .dl-chip').forEach(c => c.classList.toggle('active', c.dataset.fmt === fmt));
  const showPdfOnly = fmt === 'pdf';
  document.getElementById('dlPageSizeGroup').style.display = showPdfOnly ? 'block' : 'none';
  document.getElementById('dlMarginGroup').style.display = showPdfOnly ? 'block' : 'none';
}
function setDlPageSize(size){
  dlPageSize = size;
  document.querySelectorAll('#pageSizeOptions .dl-chip').forEach(c => c.classList.toggle('active', c.dataset.size === size));
}
function setDlMargin(m){
  dlMargin = m;
  document.querySelectorAll('#marginOptions .dl-chip').forEach(c => c.classList.toggle('active', parseInt(c.dataset.margin) === m));
}

function confirmDownload(){
  if(!hasScanned){ alert('Run the ATS scan first to generate your resume.'); return; }
  if(dlFormat === 'pdf') doDownloadPDF();
  else if(dlFormat === 'png') doDownloadPNG();
  else doDownloadTXT();
  document.getElementById('downloadPanel').style.display = 'none';
}

function resumeFileBaseName(){
  return (document.getElementById('f_name').value || 'resume').replace(/\s+/g,'_');
}

function doDownloadPDF(){
  const el = document.getElementById('previewWrap');
  const name = resumeFileBaseName();

  if(dlPageSize === 'fit'){
    // Custom page size that matches the resume's actual content height — no trailing blank space
    html2canvas(el, { scale: 2 }).then(canvas => {
      const imgData = canvas.toDataURL('image/png');
      const contentWidthMM = 210 - (dlMargin * 2); // base on A4 width so text stays a normal reading size
      const contentHeightMM = contentWidthMM * (canvas.height / canvas.width);
      const pageWidthMM = contentWidthMM + (dlMargin * 2);
      const pageHeightMM = contentHeightMM + (dlMargin * 2);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit:'mm', format:[pageWidthMM, pageHeightMM] });
      pdf.addImage(imgData, 'PNG', dlMargin, dlMargin, contentWidthMM, contentHeightMM);
      pdf.save(`${name}_resume.pdf`);
    });
    return;
  }

  html2pdf().set({
    margin: dlMargin,
    filename: `${name}_resume.pdf`,
    html2canvas: { scale: 2 },
    jsPDF: { unit:'mm', format: dlPageSize, orientation:'portrait' }
  }).from(el).save();
}

function doDownloadPNG(){
  const el = document.getElementById('previewWrap');
  const name = resumeFileBaseName();
  html2canvas(el, { scale: 2 }).then(canvas => {
    const link = document.createElement('a');
    link.download = `${name}_resume.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

function doDownloadTXT(){
  const name = document.getElementById('f_name').value;
  const title = document.getElementById('f_title').value;
  const email = document.getElementById('f_email').value;
  const phone = document.getElementById('f_phone').value;
  const location = document.getElementById('f_location').value;
  const linkedin = document.getElementById('f_linkedin').value;
  const github = document.getElementById('f_github').value;
  const summary = document.getElementById('f_summary').value;
  const exp = document.getElementById('f_exp').value;
  const edu = document.getElementById('f_edu').value;

  const lines = [
    name, title,
    [email, phone, location].filter(Boolean).join(' | '),
    [linkedin, github].filter(Boolean).join(' | '),
    '',
    'SUMMARY', summary,
    '',
    'SKILLS', skills.join(', '),
    '',
    'EXPERIENCE / PROJECTS', exp,
    '',
    'EDUCATION', edu
  ];
  const text = lines.join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const link = document.createElement('a');
  link.download = `${resumeFileBaseName()}_resume.txt`;
  link.href = URL.createObjectURL(blob);
  link.click();
}

/* ============================================================
   RULE-BASED ENGINE — no external AI API calls.
   ============================================================ */
let skills = ["HTML","CSS","JavaScript"];
let lastAnalysis = null;
let hasScanned = false;

const SKILL_DICTIONARY = ["react","javascript","typescript","html","css","git","github","rest","api","node","node.js",
"express","mongodb","sql","mysql","postgresql","tailwind","bootstrap","redux","next.js","vue","angular","java","python",
"c++","php","aws","azure","docker","kubernetes","linux","agile","scrum","communication","teamwork","leadership",
"responsive design","version control","testing","debugging","ui","ux","figma","photoshop","data structures",
"algorithms","oop","machine learning","data analysis","excel","tableau","power bi","project management","seo",
"django","flask","firebase","supabase","graphql","webpack","sass","jquery","c#",".net","android","ios","swift",
"kotlin","problem solving","collaboration","clean code","unit testing","ci/cd","devops"];

const WEAK_VERB_MAP = { "created":"Developed","made":"Built","did":"Performed","worked on":"Contributed to","helped":"Assisted in","used":"Utilized","handled":"Managed" };
const COMMON_MISSPELLINGS = { "recieve":"receive","seperate":"separate","occured":"occurred","teh":"the","definately":"definitely","acheive":"achieve","wich":"which","adress":"address","reponsible":"responsible","sucessful":"successful","enviroment":"environment","managment":"management","recieved":"received","untill":"until" };

function tokenize(text){ return (text.toLowerCase().match(/[a-z0-9+.#]+/g) || []); }
function extractRequiredKeywords(jdText){ const lower = jdText.toLowerCase(); return SKILL_DICTIONARY.filter(term => lower.includes(term)); }
function computeMatch(resumeText, jdText){
  const resumeLower = resumeText.toLowerCase();
  const required = extractRequiredKeywords(jdText);
  return { required, matched: required.filter(t=>resumeLower.includes(t)), missing: required.filter(t=>!resumeLower.includes(t)) };
}
function scoreBreakdown({matched, required}, summary, exp, skillsArr){
  const keywordScore = required.length ? Math.round((matched.length/required.length)*100) : 100;
  const formattingScore = 95;
  const skillScore = Math.min(100, Math.round((skillsArr.length/8)*100));
  const wordsInExp = tokenize(exp).length;
  const hasNumber = /\d/.test(exp);
  let experienceScore = 55;
  if(wordsInExp >= 12) experienceScore += 20;
  if(hasNumber) experienceScore += 25;
  experienceScore = Math.min(100, experienceScore);
  const sectionsScore = Math.round(([summary, exp, skillsArr.length>0].filter(Boolean).length/3)*100);
  const overall = Math.round(keywordScore*0.35 + formattingScore*0.15 + skillScore*0.2 + experienceScore*0.15 + sectionsScore*0.15);
  return { ats_score: overall, breakdown:{ keywords:keywordScore, formatting:formattingScore, skills:skillScore, experience:experienceScore, sections:sectionsScore } };
}
function buildSuggestions({missing}, summary, exp, skillsArr){
  const suggestions = [];
  if(missing.length){
    suggestions.push({ text:`"${missing[0]}" appears in the job description but not in your resume.`, type:'add_skill', skill_to_add:missing[0] });
    if(missing[1]) suggestions.push({ text:`Consider adding "${missing[1]}" — it's requested in the JD.`, type:'add_skill', skill_to_add:missing[1] });
  }
  const summaryWords = tokenize(summary).length;
  if(summaryWords < 15) suggestions.push({ text:'Your summary is too short — aim for 2-3 full sentences.', type:'improve_summary' });
  else if(summaryWords > 60) suggestions.push({ text:'Your summary is a bit long — keep it concise.', type:'general' });
  if(!/\d/.test(exp)) suggestions.push({ text:'Add a measurable achievement to your experience (a number, %, or count).', type:'general' });
  if(skillsArr.length < 5) suggestions.push({ text:`Add ${5-skillsArr.length} more skill(s) — aim for at least 5-8.`, type:'general' });
  if(!suggestions.length) suggestions.push({ text:'Strong match! Consider mirroring one more line of JD wording.', type:'general' });
  return suggestions;
}
function buildSummary(title, skillsArr, jdText){
  const topSkills = skillsArr.slice(0,4).join(', ') || 'core web technologies';
  const jdFocus = extractRequiredKeywords(jdText).slice(0,3).join(', ');
  let out = `${title || 'Aspiring professional'} with hands-on experience in ${topSkills}. Comfortable building and shipping practical projects end-to-end.`;
  if(jdFocus) out += ` Looking to apply skills in ${jdFocus} in a ${title || 'relevant'} role.`;
  return out;
}
function rewriteExperienceText(text, skillsArr){
  let out = text.trim();
  Object.keys(WEAK_VERB_MAP).forEach(weak=>{
    const re = new RegExp('\\b'+weak+'\\b', 'i');
    if(re.test(out.split('.')[0])) out = out.replace(re, WEAK_VERB_MAP[weak]);
  });
  out = out.charAt(0).toUpperCase() + out.slice(1);
  const lower = out.toLowerCase();
  const stack = skillsArr.filter(s => !lower.includes(s.toLowerCase())).slice(0,3);
  if(stack.length) out += ` Built using ${stack.join(', ')}.`;
  return out;
}
function checkGrammar(fullText){
  const issues = [];
  if(/ {2,}/.test(fullText)) issues.push({ issue:'Double spacing', ctx:'Found extra spaces between words.', fix:'none' });
  const repMatch = fullText.match(/\b(\w+)\s+\1\b/i);
  if(repMatch) issues.push({ issue:'Repeated word', ctx:`"${repMatch[0]}" appears twice in a row.`, fix:'none' });
  Object.keys(COMMON_MISSPELLINGS).forEach(mis=>{
    const re = new RegExp('\\b'+mis+'\\b','i');
    if(re.test(fullText)) issues.push({ issue:'Spelling', ctx:`"${mis}" → should be "${COMMON_MISSPELLINGS[mis]}"`, fix:'spell', from:mis, to:COMMON_MISSPELLINGS[mis] });
  });
  if(/\b(was|were|is|are)\s+\w+ed\b/i.test(fullText)) issues.push({ issue:'Style', ctx:'Passive voice detected — active voice reads stronger.', fix:'none' });
  return issues;
}

/* ============================================================
   UI wiring
   ============================================================ */
function renderSkillTags(){
  const el = document.getElementById('skillTags');
  el.innerHTML = skills.map(s => `<span class="tag"><span>${s}</span><button onclick="removeSkill('${s}')">✕</button></span>`).join('');
  renderPreview();
}
function addSkill(){
  const inp = document.getElementById('newSkill');
  const v = inp.value.trim();
  if(v && !skills.includes(v)){ skills.push(v); inp.value=''; renderSkillTags(); scheduleAutosave(); }
}
function removeSkill(s){ skills = skills.filter(x=>x!==s); renderSkillTags(); scheduleAutosave(); }

function contactLine(){
  const email = document.getElementById('f_email').value;
  const phone = document.getElementById('f_phone').value;
  const loc = document.getElementById('f_location').value;
  return [email, phone, loc].filter(Boolean).join(' · ');
}
function linksLineHtml(){
  const li = document.getElementById('f_linkedin').value.trim();
  const gh = document.getElementById('f_github').value.trim();
  const parts = [];
  if(li) parts.push(`<a href="https://${li.replace(/^https?:\/\//,'')}" target="_blank" rel="noopener">${li.replace(/^https?:\/\//,'')}</a>`);
  if(gh) parts.push(`<a href="https://${gh.replace(/^https?:\/\//,'')}" target="_blank" rel="noopener">${gh.replace(/^https?:\/\//,'')}</a>`);
  return parts.join(' &nbsp;·&nbsp; ');
}
function renderPreview(){
  const name = document.getElementById('f_name').value || 'Your Name';
  const title = (document.getElementById('f_title').value || 'Target Title').toUpperCase();
  document.getElementById('p_name').textContent = name;
  document.getElementById('p_title').textContent = title;
  document.getElementById('p_name_modern').textContent = name;
  document.getElementById('p_title_modern').textContent = title;
  document.getElementById('p_contact').textContent = contactLine();
  document.getElementById('p_links').innerHTML = linksLineHtml();
  document.getElementById('p_contact_modern').textContent = contactLine();
  document.getElementById('p_summary').textContent = document.getElementById('f_summary').value;
  document.getElementById('p_exp').textContent = document.getElementById('f_exp').value;
  document.getElementById('p_edu').textContent = document.getElementById('f_edu').value;
  document.getElementById('p_skills').innerHTML = skills.map(s=>`<span>${s}</span>`).join('');
  fillMultilineSection('p_certs', 's_certs', document.getElementById('f_certs').value);
  fillMultilineSection('p_achievements', 's_achievements', document.getElementById('f_achievements').value);
  fillMultilineSection('p_internships', 's_internships', document.getElementById('f_internships').value);
  fillMultilineSection('p_hobbies', 's_hobbies', document.getElementById('f_hobbies').value);
  fillMultilineSection('p_languages', 's_languages', document.getElementById('f_languages').value);
  renderJobSearchLinks();
}
function fillMultilineSection(pId, sectionId, value){
  const trimmed = (value || '').trim();
  const p = document.getElementById(pId);
  const section = document.getElementById(sectionId);
  if(!trimmed){ section.style.display = 'none'; return; }
  section.style.display = 'block';
  p.innerHTML = trimmed.split('\n').map(line => line.trim()).filter(Boolean).join('<br/>');
}
['f_name','f_title','f_summary','f_exp','f_edu','f_jd','f_email','f_phone','f_location','f_linkedin','f_github','f_certs','f_achievements','f_languages','f_internships','f_hobbies'].forEach(id=>{
  document.getElementById(id).addEventListener('input', ()=>{ renderPreview(); scheduleAutosave(); });
});
document.getElementById('newSkill').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addSkill(); }});

function setWorkflowStep(step){
  document.querySelectorAll('.workflow-strip .step').forEach(s=>{ s.classList.toggle('active', parseInt(s.dataset.step) <= step); });
}

function computeAndRenderResults(){
  const summary = document.getElementById('f_summary').value;
  const exp = document.getElementById('f_exp').value;
  const jdText = document.getElementById('f_jd').value.trim();
  const resumeText = `${summary} ${skills.join(' ')} ${exp} ${document.getElementById('f_edu').value}`;

  const match = computeMatch(resumeText, jdText || '');
  const scoreData = scoreBreakdown(match, summary, exp, skills);
  const suggestions = buildSuggestions(match, summary, exp, skills);
  const grammarIssues = checkGrammar(`${summary} ${exp}`);
  const improvedSummary = buildSummary(document.getElementById('f_title').value, skills, jdText);
  lastAnalysis = { ats_score: scoreData.ats_score, breakdown: scoreData.breakdown, matched_keywords: match.matched, missing_keywords: match.missing, suggestions, improved_summary: improvedSummary, grammar: grammarIssues };

  renderPreview();
  renderAnalysis(lastAnalysis);
  renderJobSearchLinks();
  return lastAnalysis;
}

function runScan(){
  const btn = document.getElementById('scanBtn');
  const btnText = document.getElementById('scanBtnText');
  const analysisBody = document.getElementById('analysisBody');
  btn.disabled = true; btnText.textContent = 'Scanning…';
  setWorkflowStep(3);
  analysisBody.innerHTML = `<div class="empty-state"><span class="big">↻</span>Running rule-based engine…</div>`;

  setTimeout(()=>{
    computeAndRenderResults();

    // Navigate to the results page — hide the input form, show resume + analysis as a fresh page
    hasScanned = true;
    document.getElementById('inputStage').style.display = 'none';
    document.getElementById('resultsWrapper').style.display = 'block';
    const downloadBtn = document.getElementById('downloadBtn');
    if(downloadBtn) downloadBtn.disabled = false;
    const historyBtn = document.getElementById('historyBtn');
    if(historyBtn) historyBtn.disabled = false;
    const shareBtn = document.getElementById('shareBtn');
    if(shareBtn) shareBtn.disabled = false;

    const preview = document.getElementById('previewWrap');
    preview.classList.add('scanning');
    setWorkflowStep(6);
    btn.disabled = false; btnText.textContent = 'Run ATS Scan';
    saveCurrentResume();
    saveVersionSnapshot();
    window.scrollTo({ top: 0, behavior: 'instant' });
    setTimeout(()=> preview.classList.remove('scanning'), 1300);
  }, 500);
}

function backToEdit(){
  document.getElementById('resultsWrapper').style.display = 'none';
  document.getElementById('inputStage').style.display = 'grid';
  setWorkflowStep(2);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function generateSummary(){
  document.getElementById('f_summary').value = buildSummary(document.getElementById('f_title').value, skills, document.getElementById('f_jd').value);
  renderPreview(); scheduleAutosave();
}
function rewriteExperience(){
  document.getElementById('f_exp').value = rewriteExperienceText(document.getElementById('f_exp').value, skills);
  renderPreview(); scheduleAutosave();
}

function renderAnalysis(r){
  const analysisBody = document.getElementById('analysisBody');
  const b = r.breakdown || {};
  const bars = [['Keywords',b.keywords],['Formatting',b.formatting],['Skills',b.skills],['Experience',b.experience],['Sections',b.sections]];
  let html = `<div class="score-ring-wrap"><div class="score-num ${r.ats_score>=80?'sc-good':(r.ats_score>=50?'sc-mid':'sc-low')}">${r.ats_score}</div><div class="score-label">ATS Score<br/>out of 100</div></div>`;
  bars.forEach(([label,val])=>{ val = val||0; html += `<div class="bar-row"><div class="label-line"><span>${label}</span><span>${val}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${val}%"></div></div></div>`; });

  const totalReq = (r.matched_keywords||[]).length + (r.missing_keywords||[]).length;
  const matchPct = totalReq ? Math.round(((r.matched_keywords||[]).length/totalReq)*100) : 100;
  html += `<div class="kw-section"><h4>Skill Gap — Coverage vs Job Description</h4>
    <div class="skill-gap-label">${(r.matched_keywords||[]).length} of ${totalReq} required keywords matched</div>
    <div class="skill-gap-bar"><div class="skill-gap-fill" style="width:${matchPct}%"><span>${matchPct}%</span></div></div>
  </div>`;

  html += `<div class="kw-section"><h4>Matched keywords</h4><div class="kw-list matched">${(r.matched_keywords||[]).map(k=>`<span>${k}</span>`).join('') || '<span style="opacity:.5">none found</span>'}</div></div>`;
  html += `<div class="kw-section"><h4>Missing keywords</h4><div class="kw-list missing">${(r.missing_keywords||[]).map(k=>`<span>${k}</span>`).join('') || '<span style="opacity:.5">none — great match!</span>'}</div></div>`;
  html += `<div class="kw-section"><h4>Suggestions — one-click fixes</h4>`;
  (r.suggestions||[]).forEach(s=>{
    const canAutofix = s.type === 'add_skill' && s.skill_to_add;
    const canImproveSummary = s.type === 'improve_summary' && r.improved_summary;
    html += `<div class="sugg"><div class="txt">${s.text}</div>
      ${canAutofix ? `<button class="fix-btn" onclick="applyAddSkill('${s.skill_to_add.replace(/'/g,"\\'")}', this)">Add "${s.skill_to_add}" to skills</button>` : ''}
      ${canImproveSummary ? `<button class="fix-btn" onclick="applyImprovedSummary(this)">Apply improved summary</button>` : ''}
      ${(!canAutofix && !canImproveSummary) ? `<button class="fix-btn" disabled>Manual edit suggested</button>` : ''}
    </div>`;
  });
  html += `</div><div class="kw-section"><h4>Grammar & spelling check</h4>`;
  if(r.grammar && r.grammar.length){
    r.grammar.forEach(g=>{
      let fixBtn = g.fix==='spell' ? `<button class="fix-btn" onclick="fixSpelling('${g.from}','${g.to}', this)">Fix "${g.from}" → "${g.to}"</button>` : '';
      html += `<div class="gram-item"><div class="issue">${g.issue}</div><div class="ctx">${g.ctx}</div>${fixBtn}</div>`;
    });
  } else {
    html += `<div class="gram-item"><div class="ctx" style="color:#6FAE1E">No issues found — looks clean.</div></div>`;
  }
  html += `</div>`;
  analysisBody.innerHTML = html;
}

function fixSpelling(from, to, btnEl){
  ['f_summary','f_exp'].forEach(id=>{
    const el = document.getElementById(id);
    const re = new RegExp('\\b'+from+'\\b','gi');
    if(re.test(el.value)) el.value = el.value.replace(re, to);
  });
  scheduleAutosave();
  reRunAfterFix();
}
function applyAddSkill(skill, btnEl){
  if(!skills.includes(skill)) skills.push(skill);
  renderSkillTags(); scheduleAutosave();
  reRunAfterFix();
}
function applyImprovedSummary(btnEl){
  if(lastAnalysis && lastAnalysis.improved_summary){
    document.getElementById('f_summary').value = lastAnalysis.improved_summary;
    scheduleAutosave();
    reRunAfterFix();
  }
}

function reRunAfterFix(){
  // Suggestion/grammar fixes re-score immediately, on the same results page — no need to click "Run ATS Scan" again.
  computeAndRenderResults();
  const preview = document.getElementById('previewWrap');
  preview.classList.add('scanning');
  setTimeout(()=> preview.classList.remove('scanning'), 700);
  saveCurrentResume();
}

renderTplRow();

/* ============================================================
   HELP CHATBOT — rule-based FAQ matching, no external AI API.
   Keyword-overlap scoring against a fixed Q&A dictionary.
   ============================================================ */
const FAQ_DB = [
  { keywords:['ats','score','calculate','calculated','how is','formula'],
    answer:'Your ATS Score is a weighted average of 5 things: Keywords (35%), Formatting (15%), Skills (20%), Experience (15%), and Sections (15%). It\'s all rule-based math — no AI involved.' },
  { keywords:['scan','run scan','how to scan','check score','test resume'],
    answer:'Fill in your resume details on the first screen, paste a job description, then click "Run ATS Scan". Your resume and score will appear right after.' },
  { keywords:['skill','skills','add skill'],
    answer:'Type a skill in the "Add a skill…" box and press Enter or click Add. Click the ✕ on any skill chip to remove it.' },
  { keywords:['template','templates','design','look','style'],
    answer:'There are 4 templates: ATS-Friendly, Modern, Minimal, and Developer. Pick one from the chips above the Run ATS Scan button — it applies once your resume appears.' },
  { keywords:['download','export','pdf','png','txt','text file','save resume'],
    answer:'After running a scan, click the "⬇ Download" button. You can choose PDF, PNG image, or Plain Text, plus page size (A4 / US Letter / Fit to Content) and margin.' },
  { keywords:['blank','empty space','page size','fit to content','half page'],
    answer:'If your PDF has blank space at the bottom, pick "Fit to Content" as the page size in the Download panel — it sizes the page to match your resume\'s actual height.' },
  { keywords:['job search','find jobs','linkedin','indeed','naukri','matching jobs'],
    answer:'Scroll down after scanning to "Find Matching Jobs" — it opens live LinkedIn, Indeed, Naukri, and Google Jobs searches using your title and top skills.' },
  { keywords:['login','signup','sign up','log in','password','account','confirm email'],
    answer:'Sign up with any email + password. If your Supabase project has email confirmation on, check your inbox for a confirmation link before logging in.' },
  { keywords:['auto save','autosave','save','saved'],
    answer:'Your resume auto-saves about 1 second after you stop typing. Watch the "Saved ✓" indicator near the top of the builder.' },
  { keywords:['delete','remove resume'],
    answer:'On the Dashboard, click the "✕ Delete" button on any resume card. This can\'t be undone.' },
  { keywords:['grammar','spelling','spell check'],
    answer:'The Grammar & Spelling section (after a scan) catches common mistakes, repeated words, and passive voice — using a fixed dictionary and regex rules, not AI.' },
  { keywords:['certification','certifications','achievement','achievements','language','languages'],
    answer:'Add Certifications, Achievements, and Languages near the bottom of the resume form — each section only shows on your resume if you fill it in.' },
  { keywords:['github','portfolio','contact'],
    answer:'Add your LinkedIn and GitHub under "Contact info" in the form — they appear as clickable links under your name on the resume.' },
  { keywords:['ai','gemini','claude','llm'],
    answer:'This app is intentionally rule-based — no external AI API is used anywhere. Every "smart" feature (scoring, suggestions, grammar check) runs as plain JavaScript logic.' },
  { keywords:['what is this','about','scanready','help','what can you do'],
    answer:'ATS Resume Builder is an ATS resume builder: build your resume, match it against a job description, get a rule-based ATS score, fix suggestions, then export it.' }
];

let chatMessages = [];
let chatOpened = false;

function toggleChat(){
  const panel = document.getElementById('chatPanel');
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'flex' : 'none';
  if(isHidden && !chatOpened){
    chatOpened = true;
    addChatMessage('bot', "Hi! I'm the ATS Resume Builder help bot 🙂 Ask me about ATS scores, templates, downloads, or anything else in the app.");
    renderChatQuickChips();
  }
}

function renderChatQuickChips(){
  const chips = [
    'How is ATS score calculated?',
    'How do I download my resume?',
    'How do templates work?',
    'How do I add skills?'
  ];
  document.getElementById('chatQuick').innerHTML = chips.map(c =>
    `<button onclick="askChatQuestion('${c.replace(/'/g,"\\'")}')">${c}</button>`
  ).join('');
}

function askChatQuestion(q){
  document.getElementById('chatInput').value = q;
  sendChatMessage();
}

function matchFAQ(query){
  const q = query.toLowerCase();
  let best = null, bestScore = 0;
  FAQ_DB.forEach(entry=>{
    let score = 0;
    entry.keywords.forEach(kw => { if(q.includes(kw)) score += kw.split(' ').length; });
    if(score > bestScore){ bestScore = score; best = entry; }
  });
  return best ? best.answer : "I don't have a scripted answer for that yet. Try asking about: ATS score, templates, skills, downloading, job search, or login.";
}

function addChatMessage(role, text){
  chatMessages.push({ role, text });
  renderChatMessages();
}

function renderChatMessages(){
  const el = document.getElementById('chatMessages');
  el.innerHTML = chatMessages.map(m => `<div class="chat-bubble ${m.role}">${m.text}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

function sendChatMessage(){
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if(!text) return;
  addChatMessage('user', text);
  input.value = '';
  setTimeout(()=>{
    addChatMessage('bot', matchFAQ(text));
  }, 350);
}

/* ============================================================
   DARK MODE — preference saved in localStorage (standalone app,
   not a Claude artifact, so localStorage is safe to use here).
   ============================================================ */
function applyDarkModePreference(){
  try{
    const saved = localStorage.getItem('atsrb_theme');
    if(saved === 'dark') document.body.classList.add('dark');
  }catch(e){ /* localStorage unavailable — ignore, default to light */ }
  updateDarkModeIcon();
}
function toggleDarkMode(){
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  try{ localStorage.setItem('atsrb_theme', isDark ? 'dark' : 'light'); }catch(e){}
  updateDarkModeIcon();
}
function updateDarkModeIcon(){
  const icon = document.getElementById('darkModeIcon');
  if(icon) icon.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
}

/* ============================================================
   RESUME VERSION HISTORY
   ============================================================ */
let currentVersionsCache = [];

function buildSnapshot(){
  return {
    title: document.getElementById('resumeNameInput').value,
    template: currentTemplate,
    name: document.getElementById('f_name').value,
    targetTitle: document.getElementById('f_title').value,
    email: document.getElementById('f_email').value,
    phone: document.getElementById('f_phone').value,
    location: document.getElementById('f_location').value,
    linkedin: document.getElementById('f_linkedin').value,
    github: document.getElementById('f_github').value,
    summary: document.getElementById('f_summary').value,
    skills: skills,
    exp: document.getElementById('f_exp').value,
    edu: document.getElementById('f_edu').value,
    certs: document.getElementById('f_certs').value,
    achievements: document.getElementById('f_achievements').value,
    internships: document.getElementById('f_internships').value,
    hobbies: document.getElementById('f_hobbies').value,
    languages: document.getElementById('f_languages').value,
    jd: document.getElementById('f_jd').value
  };
}

async function saveVersionSnapshot(){
  if(!currentResumeId || !currentUser || !supabaseClient) return;
  try{
    await supabaseClient.from('resume_versions').insert({
      resume_id: currentResumeId,
      user_id: currentUser.id,
      snapshot: buildSnapshot(),
      ats_score: lastAnalysis ? lastAnalysis.ats_score : null
    });
  }catch(e){ console.error(e); }
}

function toggleHistoryPanel(){
  closeOtherPanels('historyPanel');
  const panel = document.getElementById('historyPanel');
  const opening = panel.style.display === 'none';
  panel.style.display = opening ? 'block' : 'none';
  if(opening) loadVersionHistory();
}

async function loadVersionHistory(){
  const list = document.getElementById('historyList');
  list.innerHTML = '<div class="empty-state" style="padding:14px 0;font-size:11.5px;">Loading…</div>';
  try{
    const { data, error } = await supabaseClient.from('resume_versions')
      .select('*').eq('resume_id', currentResumeId)
      .order('created_at', { ascending:false }).limit(10);
    if(error) throw error;
    currentVersionsCache = data || [];
    if(!currentVersionsCache.length){
      list.innerHTML = '<div class="empty-state" style="padding:14px 0;font-size:11.5px;">No saved versions yet — run a scan to create one.</div>';
      return;
    }
    list.innerHTML = currentVersionsCache.map((v,i) => `
      <div class="history-item">
        <div class="hist-meta">${new Date(v.created_at).toLocaleString()} — ATS ${v.ats_score != null ? v.ats_score : '—'}</div>
        <button class="hist-restore" onclick="restoreVersion(${i})">Restore</button>
      </div>
    `).join('');
  } catch(err){
    console.error(err);
    list.innerHTML = '<div class="empty-state" style="padding:14px 0;font-size:11.5px;">Could not load history — make sure you\'ve run the latest schema.sql (resume_versions table).</div>';
  }
}

function restoreVersion(index){
  const v = currentVersionsCache[index];
  if(!v) return;
  if(!confirm('Restore this version? Unsaved edits in the form will be replaced.')) return;
  const snap = v.snapshot;
  document.getElementById('resumeNameInput').value = snap.title || 'Untitled Resume';
  document.getElementById('f_name').value = snap.name || '';
  document.getElementById('f_title').value = snap.targetTitle || '';
  document.getElementById('f_email').value = snap.email || '';
  document.getElementById('f_phone').value = snap.phone || '';
  document.getElementById('f_location').value = snap.location || '';
  document.getElementById('f_linkedin').value = snap.linkedin || '';
  document.getElementById('f_github').value = snap.github || '';
  document.getElementById('f_summary').value = snap.summary || '';
  document.getElementById('f_exp').value = snap.exp || '';
  document.getElementById('f_edu').value = snap.edu || '';
  document.getElementById('f_certs').value = snap.certs || '';
  document.getElementById('f_achievements').value = snap.achievements || '';
  document.getElementById('f_internships').value = snap.internships || '';
  document.getElementById('f_hobbies').value = snap.hobbies || '';
  document.getElementById('f_languages').value = snap.languages || '';
  document.getElementById('f_jd').value = snap.jd || '';
  skills = (snap.skills || []).slice();
  setTemplate(snap.template || 'tpl-ats', false);
  renderSkillTags();
  document.getElementById('historyPanel').style.display = 'none';
  backToEdit();
  scheduleAutosave();
}

/* ============================================================
   PUBLIC SHARE LINK
   ============================================================ */
function toggleSharePanel(){
  closeOtherPanels('sharePanel');
  const panel = document.getElementById('sharePanel');
  const opening = panel.style.display === 'none';
  panel.style.display = opening ? 'block' : 'none';
  if(opening) initSharePanel();
}

async function initSharePanel(){
  try{
    const { data, error } = await supabaseClient.from('resumes').select('is_public').eq('id', currentResumeId).single();
    if(error) throw error;
    document.getElementById('shareToggle').checked = !!data.is_public;
    document.getElementById('shareLinkBox').style.display = data.is_public ? 'block' : 'none';
    if(data.is_public) updateShareLinkInput();
  }catch(e){ console.error(e); }
}

async function onShareToggle(checked){
  try{
    const { error } = await supabaseClient.from('resumes').update({ is_public: checked }).eq('id', currentResumeId).eq('user_id', currentUser.id);
    if(error) throw error;
    document.getElementById('shareLinkBox').style.display = checked ? 'block' : 'none';
    if(checked) updateShareLinkInput();
  } catch(e){
    console.error(e);
    alert('Could not update sharing: ' + e.message);
  }
}

function updateShareLinkInput(){
  const url = `${location.origin}${location.pathname}?share=${currentResumeId}`;
  document.getElementById('shareLinkInput').value = url;
}

function copyShareLink(){
  const input = document.getElementById('shareLinkInput');
  input.select();
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(input.value).then(()=> alert('Link copied!')).catch(()=>{});
  } else {
    document.execCommand('copy');
    alert('Link copied!');
  }
}

/* ============================================================
   PUBLIC VIEW PAGE (?share=<resume_id> — no login required)
   ============================================================ */
async function checkPublicShareView(){
  const params = new URLSearchParams(location.search);
  const shareId = params.get('share');
  if(!shareId) return false;

  document.getElementById('page-auth').style.display = 'none';
  document.getElementById('page-app').style.display = 'none';
  document.getElementById('page-public').style.display = 'block';
  const fab = document.getElementById('chatFab');
  if(fab) fab.style.display = 'none';

  const host = document.getElementById('publicPreviewHost');
  host.innerHTML = '<div class="empty-state">Loading resume…</div>';
  try{
    const { data, error } = await supabaseClient.from('resumes').select('*').eq('id', shareId).eq('is_public', true).single();
    if(error || !data) throw error || new Error('Resume not found or not public');
    host.innerHTML = renderPublicPreviewHtml(data);
  } catch(err){
    console.error(err);
    host.innerHTML = '<div class="empty-state">This resume link is invalid, or is no longer shared publicly.</div>';
  }
  return true;
}

function renderPublicPreviewHtml(row){
  const contactParts = [row.email, row.phone, row.location].filter(Boolean).join(' · ');
  const linksParts = [row.linkedin, row.github].filter(Boolean)
    .map(l => `<a href="https://${l.replace(/^https?:\/\//,'')}" target="_blank" rel="noopener">${l.replace(/^https?:\/\//,'')}</a>`)
    .join(' &nbsp;·&nbsp; ');
  const skillsHtml = (row.skills || []).map(s => `<span>${s}</span>`).join('');
  const section = (title, content) => (content && content.trim())
    ? `<div class="r-section"><h3>${title}</h3><p>${content.split('\n').map(l=>l.trim()).filter(Boolean).join('<br/>')}</p></div>`
    : '';
  const tpl = row.template || 'tpl-ats';
  return `
    <div class="preview-wrap ${tpl}">
      <div class="r-header" style="${tpl === 'tpl-modern' ? '' : 'display:none;'}">
        <p class="r-name">${row.name || ''}</p>
        <p class="r-title">${(row.target_title || '').toUpperCase()}</p>
        <p class="r-contact-inline">${contactParts}</p>
      </div>
      <div class="r-inner">
        <p class="r-name">${row.name || ''}</p>
        <p class="r-title">${(row.target_title || '').toUpperCase()}</p>
        <p class="r-contact">${contactParts}</p>
        <p class="r-links">${linksParts}</p>
        <div class="r-section"><h3>Summary</h3><p>${row.summary || ''}</p></div>
        <div class="r-section"><h3>Skills</h3><div class="r-skills-line">${skillsHtml}</div></div>
        <div class="r-section"><h3>Experience / Projects</h3><p>${row.experience || ''}</p></div>
        <div class="r-section"><h3>Education</h3><p>${row.education || ''}</p></div>
        ${section('Certifications', row.certifications)}
        ${section('Achievements', row.achievements)}
        ${section('Internships', row.internships)}
        ${section('Hobbies & Interests', row.hobbies)}
        ${section('Languages', row.languages)}
      </div>
    </div>
  `;
}

