const SUPABASE_URL = "https://xdzchsadhwvlkembhoom.supabase.co";
const SUPABASE_KEY = "sb_publishable_Wu_E1EyLPw8GLSZPpHHO7Q_Howtd6wE";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

console.log("Supabase 初始化成功！");
console.log("Supabase 連線物件：", supabaseClient);
const $ = (id) => document.getElementById(id);
// ===== 會員登入功能 =====

let authMode = "login";

// 開啟會員視窗
$("login-btn").addEventListener("click", () => {
  authMode = "login";
  updateAuthMode();
  $("auth-message").textContent = "";
  $("auth-dialog").showModal();
});

// 關閉會員視窗
$("close-auth").addEventListener("click", () => {
  $("auth-dialog").close();
});

// 切換登入與註冊
$("switch-auth").addEventListener("click", () => {
  authMode = authMode === "login" ? "signup" : "login";
  updateAuthMode();
  $("auth-message").textContent = "";
});

// 更新視窗文字
function updateAuthMode() {
  $("auth-title").textContent =
    authMode === "login" ? "會員登入" : "會員註冊";

  $("auth-submit").textContent =
    authMode === "login" ? "登入" : "註冊";

  $("switch-auth").textContent =
    authMode === "login"
      ? "還沒有帳號？註冊"
      : "已有帳號？返回登入";
}

// 執行登入或註冊
$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;

  $("auth-submit").disabled = true;
  $("auth-message").textContent = "處理中，請稍候...";

  try {
    let result;

    if (authMode === "signup") {
      result = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            "https://sinru120.github.io/STUDY-QUIZ-TEST/"
        }
      });

      if (result.error) throw result.error;

      $("auth-message").textContent =
        "註冊成功！請到 Email 收取驗證信，完成驗證後再登入。";

    } else {
      result = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (result.error) throw result.error;

      $("auth-message").textContent = "登入成功！";
      $("auth-dialog").close();
      $("auth-form").reset();
    }

  } catch (error) {
    $("auth-message").textContent =
      "操作失敗：" + error.message;
  } finally {
    $("auth-submit").disabled = false;
  }
});

// 登出
$("logout-btn").addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    alert("登出失敗：" + error.message);
  }
});

// 更新會員畫面
function updateAuthUI(user) {
  $("user-email").textContent =
    user ? user.email : "尚未登入";

  $("login-btn").classList.toggle("hidden", !!user);
  $("logout-btn").classList.toggle("hidden", !user);
}

// 檢查目前登入狀態
async function checkAuth() {
  const { data, error } =
    await supabaseClient.auth.getSession();

  if (error) {
    console.error("讀取登入狀態失敗：", error.message);
    return;
  }

  updateAuthUI(data.session?.user || null);
}

// 監聽登入狀態變化

supabaseClient.auth.onAuthStateChange((event, session) => {
  updateAuthUI(session?.user || null);

  if(event === "SIGNED_IN"){
    setTimeout(() => {
      syncQuestionsFromCloud().then(() => {
        renderHome();
        renderManage();
      });
    }, 0);
  }
});


checkAuth();

// ===== 會員登入功能結束 =====

// 取得目前登入會員
async function getCurrentUser(){
  const { data, error } =
    await supabaseClient.auth.getUser();

  if(error){
    console.error("取得會員資料失敗：", error.message);
    return null;
  }

  return data.user;
}

 // 取得或建立科目
async function getSubjectId(subjectName){
  const { data: existing, error: findError } =
    await supabaseClient
      .from("subjects")
      .select("id")
      .eq("name", subjectName)
      .maybeSingle();

  if(findError){
    throw findError;
  }

  if(existing){
    return existing.id;
  }

  const { data: created, error: insertError } =
    await supabaseClient
      .from("subjects")
      .insert({ name: subjectName })
      .select("id")
      .single();

  if(insertError){
    throw insertError;
  }

  return created.id;
}

 // 取得或建立章節
async function getChapterId(subjectId, chapterName){
  const { data: existing, error: findError } =
    await supabaseClient
      .from("chapters")
      .select("id")
      .eq("subject_id", subjectId)
      .eq("name", chapterName)
      .maybeSingle();

  if(findError){
    throw findError;
  }

  if(existing){
    return existing.id;
  }

  const { data: created, error: insertError } =
    await supabaseClient
      .from("chapters")
      .insert({
        subject_id: subjectId,
        name: chapterName
      })
      .select("id")
      .single();

  if(insertError){
    throw insertError;
  }

  return created.id;
}

// 將題目儲存到 Supabase
async function saveQuestionToCloud(item, user){
  const subjectId = await getSubjectId(item.subject);
  const chapterId = await getChapterId(
    subjectId,
    item.chapter
  );

  const cloudQuestion = {
    local_id: item.id,
    subject_id: subjectId,
    chapter_id: chapterId,
    created_by: user.id,
    question: item.question,
    options: item.options,
    correct_answer: ["A", "B", "C", "D"][item.answer],
    explanation: item.explanation,
    visibility: item.visibility
  };

  const { data: existing, error: findError } =
    await supabaseClient
      .from("questions")
      .select("id")
      .eq("created_by", user.id)
      .eq("local_id", item.id)
      .maybeSingle();

  if(findError) throw findError;

  let result;

  if(existing){
    result = await supabaseClient
      .from("questions")
      .update(cloudQuestion)
      .eq("id", existing.id);
  }else{
    result = await supabaseClient
      .from("questions")
      .insert(cloudQuestion);
  }

  if(result.error){
    throw result.error;
  }

  console.log("題目已同步到 Supabase！");
}

// 從 Supabase 讀取題目
async function loadQuestionsFromCloud(){
  const user = await getCurrentUser();

  let query = supabaseClient
    .from("questions")
    .select(`
      id,
      local_id,
      created_by,
      question,
      options,
      correct_answer,
      explanation,
      visibility,
      subjects(name),
      chapters(name)
    `);

  if(user){
    query = query.or(
      `visibility.eq.shared,created_by.eq.${user.id}`
    );
  }else{
    query = query.eq("visibility","shared");
  }

  const { data, error } = await query;

  if(error){
    console.error("讀取雲端題目失敗：",error.message);
    return [];
  }

  return data.map(q => ({
    id: q.local_id || q.id,
    cloudId: q.id,
    createdBy: q.created_by,
    subject: q.subjects?.name || "",
    chapter: q.chapters?.name || "",
    question: q.question,
    options: q.options,
    answer: ["A","B","C","D"].indexOf(q.correct_answer),
    explanation: q.explanation || "",
    image: "",
    visibility: q.visibility
  }));
}


const STORAGE_KEY = "study_quiz_questions_v1";
const WRONG_KEY = "study_quiz_wrong_v1";
// 合併本機與雲端題目
async function syncQuestionsFromCloud(){
  const cloudQuestions = await loadQuestionsFromCloud();

  if(!cloudQuestions.length){
    console.log("目前沒有可同步的雲端題目");
    return;
  }

  cloudQuestions.forEach(cloudQ => {
    const index = questions.findIndex(
      localQ => localQ.id === cloudQ.id
    );

    if(index >= 0){
      questions[index] = {
        ...questions[index],
        ...cloudQ
      };
    }else{
      questions.push(cloudQ);
    }
  });

  save();

  console.log(
    `雲端題目同步完成，共讀取 ${cloudQuestions.length} 題`
  );
}
uiz_wrong_v1";
const HISTORY_KEY = "study_quiz_history_v1";
let questions = load(STORAGE_KEY, []);
let wrongIds = load(WRONG_KEY, []);
let history = load(HISTORY_KEY, []);
let currentQuiz = null;
let imageDraft = "";

function load(key, fallback){ try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(questions)); localStorage.setItem(WRONG_KEY, JSON.stringify(wrongIds)); localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }
function uid(){ return "q_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function esc(value=""){ return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function unique(values){ return [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-Hant")); }
function showView(name){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  $("view-"+name).classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  if(name==="home") renderHome();
  if(name==="manage") renderManage();
  if(name==="wrong") renderWrong();
  if(name==="records") renderRecords();
  window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
$("go-practice").addEventListener("click",()=>{$("home-subject").focus();$("home-subject").scrollIntoView({behavior:"smooth",block:"center"});});
$("start-quiz").addEventListener("click",()=>startFromHome());
$("retry-wrong").addEventListener("click",()=>startQuiz(questions.filter(q=>wrongIds.includes(q.id))));
$("new-question").addEventListener("click",()=>openDialog());
$("close-dialog").addEventListener("click",closeDialog);
$("cancel-dialog").addEventListener("click",closeDialog);
$("question-form").addEventListener("submit",saveQuestion);
$("q-image").addEventListener("change",handleImage);
$("import-btn").addEventListener("click",()=>$("import-file").click());
$("import-file").addEventListener("change",importFile);
$("export-btn").addEventListener("click",exportBackup);
$("manage-search").addEventListener("input",renderManage);
$("manage-subject").addEventListener("change",renderManage);
$("home-subject").addEventListener("change",updateHomeChapters);
$("exit-quiz").addEventListener("click",()=>showView("home"));

function renderHome(){
  $("stat-total").textContent=questions.length;
  $("stat-wrong").textContent=wrongIds.filter(id=>questions.some(q=>q.id===id)).length;
  $("stat-records").textContent=history.length;
  const subject=$("home-subject").value;
  fillSelect($("home-subject"),unique(questions.map(q=>q.subject)),"全部科目",subject);
  updateHomeChapters();
}
function fillSelect(select,values,placeholder,selected=""){
  select.innerHTML='<option value="">'+esc(placeholder)+'</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
  if(values.includes(selected)) select.value=selected;
}
function updateHomeChapters(){
  const subject=$("home-subject").value;
  const old=$("home-chapter").value;
  const chapters=unique(questions.filter(q=>!subject||q.subject===subject).map(q=>q.chapter));
  fillSelect($("home-chapter"),chapters,"全部章節",old);
}
function renderManage(){
  fillSelect($("manage-subject"),unique(questions.map(q=>q.subject)),"全部科目",$("manage-subject").value);
  const term=$("manage-search").value.trim().toLowerCase(), subject=$("manage-subject").value;
  const list=questions.filter(q=>(!subject||q.subject===subject)&&(!term||[q.question,q.subject,q.chapter].join(" ").toLowerCase().includes(term)));
  $("question-list").innerHTML=list.length?list.map(q=>'<article class="question-card"><div class="q-info"><div class="q-meta">'+esc(q.subject)+'　／　'+esc(q.chapter)+'</div><div class="q-title">'+esc(q.question)+'</div></div><div class="q-actions"><button class="mini-btn" data-edit="'+q.id+'">編輯</button><button class="mini-btn danger" data-delete="'+q.id+'">刪除</button></div></article>').join(""):'<div class="empty-state"><b>還沒有符合的題目</b>可以新增題目，或匯入既有題庫。</div>';
  $("question-list").querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>openDialog(b.dataset.edit)));
  $("question-list").querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteQuestion(b.dataset.delete)));
}
function renderWrong(){
  const list=questions.filter(q=>wrongIds.includes(q.id));
  $("wrong-list").innerHTML=list.length?list.map(q=>'<article class="question-card"><div class="q-info"><div class="q-meta">'+esc(q.subject)+'　／　'+esc(q.chapter)+'</div><div class="q-title">'+esc(q.question)+'</div></div><button class="mini-btn" data-remove-wrong="'+q.id+'">移出錯題</button></article>').join(""):'<div class="empty-state"><b>目前沒有待複習的錯題</b>完成測驗後，答錯的題目會出現在這裡。</div>';
  $("wrong-list").querySelectorAll("[data-remove-wrong]").forEach(b=>b.addEventListener("click",()=>{wrongIds=wrongIds.filter(id=>id!==b.dataset.removeWrong);save();renderWrong();renderHome();}));
}
function renderRecords(){
  $("record-list").innerHTML=history.length?history.slice().reverse().map(r=>'<div class="record-row"><div><b>'+esc(r.label)+'</b><small>'+esc(r.date)+' · '+r.total+' 題</small></div><div class="record-score">'+r.score+' 分</div></div>').join(""):'<div class="empty-state"><b>還沒有測驗紀錄</b>完成第一次練習後，紀錄就會顯示在這裡。</div>';
}

function openDialog(id=""){
  $("question-form").reset();
  $("edit-id").value=id;
  imageDraft="";

  const q=questions.find(x=>x.id===id);

  $("dialog-title").textContent=q?"編輯題目":"新增題目";

  // 預設為私人題目
  $("q-visibility").value=q?.visibility || "private";

  if(q){
    $("q-subject").value=q.subject;
    $("q-chapter").value=q.chapter;
    $("q-question").value=q.question;
    $("q-a").value=q.options[0];
    $("q-b").value=q.options[1];
    $("q-c").value=q.options[2];
    $("q-d").value=q.options[3];
    $("q-answer").value=String(q.answer);
    $("q-explanation").value=q.explanation||"";
    imageDraft=q.image||"";
  }

  $("question-dialog").showModal();
}

function closeDialog(){ $("question-dialog").close(); }
function handleImage(e){
  const file=e.target.files[0]; if(!file)return;
  if(file.size>2*1024*1024){alert("圖片請小於 2MB，避免題庫備份檔過大。");e.target.value="";return;}
  const reader=new FileReader();reader.onload=()=>{imageDraft=reader.result;};reader.readAsDataURL(file);
}


async function saveQuestion(e){
  e.preventDefault();

  const id=$("edit-id").value||uid();

  const item={
    id,
    subject:$("q-subject").value.trim(),
    chapter:$("q-chapter").value.trim(),
    question:$("q-question").value.trim(),
    options:[
      $("q-a").value.trim(),
      $("q-b").value.trim(),
      $("q-c").value.trim(),
      $("q-d").value.trim()
    ],
    answer:Number($("q-answer").value),
    explanation:$("q-explanation").value.trim(),
    image:imageDraft,
    visibility:$("q-visibility").value
  };

  const index=questions.findIndex(q=>q.id===id);

  if(index>=0){
    questions[index]=item;
  }else{
    questions.push(item);
  }

  save();
  closeDialog();
  renderManage();
  renderHome();

  try{
    const user=await getCurrentUser();

    if(!user){
      alert("題目已儲存在本機，但請先登入才能同步到雲端。");
      return;
    }

    await saveQuestionToCloud(item,user);

    alert("題目已成功儲存並同步到雲端！");
  }catch(error){
    console.error("雲端儲存失敗：",error);
    alert("本機儲存成功，但雲端同步失敗："+error.message);
  }
}

function deleteQuestion(id){
  if(!confirm("確定要刪除這題嗎？"))return;
  questions=questions.filter(q=>q.id!==id);wrongIds=wrongIds.filter(x=>x!==id);save();renderManage();renderHome();
}
function startFromHome(){
  const subject=$("home-subject").value,chapter=$("home-chapter").value,count=$("home-count").value;
  let list=questions.filter(q=>(!subject||q.subject===subject)&&(!chapter||q.chapter===chapter));
  if(count!=="all")list=list.slice().sort(()=>Math.random()-.5).slice(0,Number(count));
  startQuiz(list);
}
function startQuiz(list){
  if(!list.length){alert("目前沒有可練習的題目，請先新增或匯入題庫。");return;}
  currentQuiz={items:list.slice().sort(()=>Math.random()-.5),index:0,answers:{},submitted:false,correct:0};
  showView("quiz");renderQuiz();
}
function renderQuiz(){
  const q=currentQuiz.items[currentQuiz.index],idx=currentQuiz.index,total=currentQuiz.items.length;
  $("quiz-progress-label").textContent='第 '+(idx+1)+' 題，共 '+total+' 題';
  $("quiz-progress").style.width=((idx+1)/total*100)+'%';
  const selected=currentQuiz.answers[q.id];
  $("quiz-area").innerHTML='<article class="quiz-card"><div class="quiz-meta">'+esc(q.subject)+'　／　'+esc(q.chapter)+'</div><h2 class="quiz-question">'+esc(q.question)+'</h2>'+(q.image?'<img class="quiz-image" src="'+q.image+'" alt="題目圖片">':'')+'<div class="option-list">'+q.options.map((o,i)=>'<button class="option '+(currentQuiz.submitted?(i===q.answer?'correct':(i===selected?'incorrect':'')):(selected===i?'selected':''))+'" data-option="'+i+'" '+(currentQuiz.submitted?'disabled':'')+'><span class="option-letter">'+String.fromCharCode(65+i)+'</span>'+esc(o)+'</button>').join("")+'</div>'+(currentQuiz.submitted?feedbackHTML(q,selected):'')+'<div class="quiz-actions">'+(currentQuiz.submitted?'<button class="primary-btn" id="next-question">'+(idx===total-1?'查看結果':'下一題 →')+'</button>':'<button class="primary-btn" id="submit-answer" '+(selected===undefined?'disabled':'')+'>確認答案</button>')+'</div></article>';
  $("quiz-area").querySelectorAll("[data-option]").forEach(b=>b.addEventListener("click",()=>{currentQuiz.answers[q.id]=Number(b.dataset.option);renderQuiz();}));
  if(currentQuiz.submitted){$("next-question").addEventListener("click",nextQuestion);}else{$("submit-answer").addEventListener("click",submitAnswer);}
}
function feedbackHTML(q,selected){
  const good=selected===q.answer;
  return '<div class="quiz-feedback '+(good?'good':'bad')+'"><b>'+(good?'答對了！':'再記住這個觀念！')+'</b><br>正確答案：'+String.fromCharCode(65+q.answer)+'．'+esc(q.options[q.answer])+'<br>'+esc(q.explanation||"這題尚未新增解析。")+'</div>';
}
function submitAnswer(){
  const q=currentQuiz.items[currentQuiz.index],answer=currentQuiz.answers[q.id];if(answer===undefined)return;
  currentQuiz.submitted=true;
  if(answer===q.answer){currentQuiz.correct++;wrongIds=wrongIds.filter(id=>id!==q.id);}else if(!wrongIds.includes(q.id)){wrongIds.push(q.id);}
  save();renderQuiz();
}
function nextQuestion(){
  if(currentQuiz.index<currentQuiz.items.length-1){currentQuiz.index++;currentQuiz.submitted=false;renderQuiz();return;}
  const total=currentQuiz.items.length,score=Math.round(currentQuiz.correct/total*100);
  history.push({label:"練習測驗",date:new Date().toLocaleString("zh-TW"),total,score,correct:currentQuiz.correct});
  save();
  $("quiz-progress").style.width="100%";
  $("quiz-area").innerHTML='<article class="quiz-card"><div class="result-score"><div class="score-ring">'+score+'</div><span class="eyebrow">QUIZ COMPLETED</span><h2>完成本次練習！</h2><p>答對 '+currentQuiz.correct+' 題，共 '+total+' 題。</p></div><div class="quiz-actions"><button class="soft-btn" id="result-home">回到首頁</button><button class="primary-btn" id="result-again">再練一次 →</button></div></article>';
  $("result-home").addEventListener("click",()=>showView("home"));
  $("result-again").addEventListener("click",()=>startQuiz(currentQuiz.items));
}
function exportBackup(){
  const data={version:1,exportedAt:new Date().toISOString(),questions,wrongIds,history};
  downloadFile("study-quiz-backup.json",JSON.stringify(data,null,2),"application/json");
}
function downloadFile(name,content,type){
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
}
function importFile(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      let incoming=[];
      if(file.name.toLowerCase().endsWith(".csv"))incoming=parseCSV(reader.result);
      else{
        const data=JSON.parse(reader.result);
        incoming=Array.isArray(data)?data:(data.questions||[]);
        if(!Array.isArray(incoming))throw new Error("找不到題目清單");
        if(!Array.isArray(data)&&data.wrongIds)wrongIds=[...new Set([...wrongIds,...data.wrongIds])];
        if(!Array.isArray(data)&&data.history)history=[...history,...data.history];
      }
      const valid=incoming.map(normalizeQuestion).filter(Boolean);
      if(!valid.length)throw new Error("沒有讀取到有效題目");
      const map=new Map(questions.map(q=>[q.id,q]));valid.forEach(q=>map.set(q.id,q));questions=[...map.values()];
      save();renderManage();renderHome();alert("成功匯入 "+valid.length+" 題！");
    }catch(err){alert("匯入失敗："+err.message+"。請確認檔案格式。");}
    e.target.value="";
  };
  reader.readAsText(file);
}
function normalizeQuestion(q){
  if(!q||!q.question||!Array.isArray(q.options)||q.options.length!==4)return null;
  const answer=Number(q.answer);
  if(!Number.isInteger(answer)||answer<0||answer>3)return null;
  return {id:String(q.id||uid()),subject:String(q.subject||"未分類"),chapter:String(q.chapter||"未分類"),question:String(q.question),options:q.options.map(String),answer,explanation:String(q.explanation||""),image:String(q.image||"")};
}
function parseCSV(text){
  const rows=text.trim().split(/\r?\n/).map(line=>line.split(",").map(v=>v.trim().replace(/^"|"$/g,"")));
  return rows.slice(1).map((r,i)=>({id:uid(),subject:r[0],chapter:r[1],question:r[2],options:r.slice(3,7),answer:"ABCD".indexOf((r[7]||"A").toUpperCase()),explanation:r[8]||""})).filter(q=>q.options.length===4);
}

// 網站啟動與雲端題目同步
async function initializeApp(){
  renderHome();

  await syncQuestionsFromCloud();

  renderHome();
}

initializeApp();

