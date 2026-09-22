const QUESTIONS=[
["Qual tecnologia usa sensores para monitorar qualidade do ar e água em tempo real?",["Blockchain","IoT e Sensores","Realidade Virtual","Cloud Computing"],1,"iot"],
["Qual fonte de energia limpa é gerada pela força dos ventos?",["Solar","Eólica","Hidrelétrica","Geotérmica"],1,"energia"],
["Como a IA pode ajudar na preservação ambiental?",["Apenas jogos","Previsão de desastres e otimização de recursos","Redes sociais","Streaming de vídeo"],1,"ia"],
["O que são Cidades Inteligentes?",["Cidades com mais prédios","Cidades que usam tecnologia para sustentabilidade","Cidades grandes","Cidades antigas"],1,"cidades"],
["Qual é o principal benefício da energia solar?",["É cara","É renovável e limpa","Funciona só à noite","Polui muito"],1,"energia"],
["Sensores IoT podem detectar:",["Apenas temperatura","Poluição, umidade, qualidade do ar e água","Só sons","Apenas luz"],1,"iot"],
["Como a IA ajuda na agricultura sustentável?",["Não ajuda","Otimiza irrigação e prevê pragas","Apenas colhe","Só planta"],1,"ia"],
["Qual tecnologia permite iluminação inteligente nas cidades?",["Lâmpadas comuns","IoT com sensores de presença","Velas","Lanternas"],1,"cidades"],
["Painéis solares convertem:",["Vento em energia","Luz solar em eletricidade","Água em energia","Som em energia"],1,"energia"],
["O que a tecnologia verde busca?",["Mais poluição","Equilíbrio entre tecnologia e natureza","Destruir florestas","Gastar mais energia"],1,"geral"]
];

const ICONS={iot:"📡",energia:"⚡",ia:"🤖",cidades:"🏙️",geral:"🌿"};
const NAMES={iot:"IoT & Sensores",energia:"Energia Limpa",ia:"IA Ambiental",cidades:"Cidades Inteligentes",geral:"Tecnologia Verde"};

let currentQuestion=0,score=0,trees=0,level=1,questionsAnswered=0;

const treeEl=document.getElementById("treeCount"),
scoreEl=document.getElementById("scoreCount"),
levelEl=document.getElementById("levelCount"),
pctEl=document.getElementById("progressPct"),
fillEl=document.getElementById("progressFill"),
field=document.getElementById("gameField"),
startBtn=document.getElementById("startBtn"),
resetBtn=document.getElementById("resetBtn");

function updateHUD(){
  treeEl.textContent=trees;
  scoreEl.textContent=score;
  levelEl.textContent=level;
  pctEl.textContent=questionsAnswered*10+"%";
  fillEl.style.width=questionsAnswered*10+"%";
}

function showQuestion(){
  if(questionsAnswered>=10)return levelComplete();

  const q=QUESTIONS[currentQuestion%QUESTIONS.length];

  field.innerHTML=`
    <div class="quiz-container">
      <div class="quiz-header">
        <div class="quiz-category">${ICONS[q[3]]} ${NAMES[q[3]]}</div>
        <div class="quiz-number">Pergunta ${questionsAnswered+1}/10</div>
      </div>
      <div class="quiz-question"><h3>${q[0]}</h3></div>
      <div class="quiz-options">
        ${q[1].map((o,i)=>`
          <button class="quiz-option" data-index="${i}">
            <span class="quiz-option__letter">${String.fromCharCode(65+i)}</span>
            <span class="quiz-option__text">${o}</span>
          </button>`).join("")}
      </div>
    </div>`;

  document.querySelectorAll(".quiz-option").forEach(b=>
    b.onclick=()=>handleAnswer(b,q)
  );
}

function handleAnswer(button,q){
  const selected=+button.dataset.index,correct=selected===q[2];

  document.querySelectorAll(".quiz-option").forEach(o=>{
    o.disabled=true;
    const i=+o.dataset.index;
    if(i===q[2])o.classList.add("quiz-option--correct");
    else if(i===selected&&!correct)o.classList.add("quiz-option--wrong");
  });

  questionsAnswered++;
  if(correct)score+=100,trees++;
  updateHUD();

  setTimeout(()=>{currentQuestion++;showQuestion()},1500);
}

function levelComplete(){
  field.innerHTML=`
    <div class="level-complete">
      <div class="level-complete__icon">🏆</div>
      <h2 class="level-complete__title">Nível ${level} Completo!</h2>
      <div class="level-complete__stats">
        <div class="stat-item"><span class="stat-value">${score/100}/10</span><span class="stat-label">Acertos</span></div>
        <div class="stat-item"><span class="stat-value">${score/10}%</span><span class="stat-label">Precisão</span></div>
        <div class="stat-item"><span class="stat-value">${trees}</span><span class="stat-label">Árvores</span></div>
      </div>
      <button class="btn btn--neon" id="continueBtn">${level>=5?"Ver Resultado Final":"Próximo Nível"} →</button>
    </div>`;

  document.getElementById("continueBtn").onclick=()=>{
    if(level>=5)return endGame();
    level++;
    questionsAnswered=0;
    updateHUD();
    startGame();
  };
}

function startGame(){
  startBtn.disabled=true;
  resetBtn.disabled=false;
  currentQuestion=Math.floor(Math.random()*QUESTIONS.length);
  showQuestion();
}

function endGame(){
  field.innerHTML=`
    <div class="game-over">
      <div class="game-over__icon">🌍</div>
      <h2 class="game-over__title">Parabéns!</h2>
      <div class="game-over__stats">
        <div class="stat-card"><div class="stat-card__value">${score}</div><div class="stat-card__label">Pontos</div></div>
        <div class="stat-card"><div class="stat-card__value">${trees}</div><div class="stat-card__label">Árvores</div></div>
      </div>
    </div>`;

  startBtn.disabled=false;
  startBtn.innerHTML="Jogar Novamente";
}

function resetGame(){
  score=trees=questionsAnswered=currentQuestion=0;
  level=1;
  updateHUD();

  field.innerHTML=`
    <div class="game-start">
      <div class="game-start__icon">🌱</div>
      <h3>Bem-vindo ao EcoQuest!</h3>
      <p>Teste seus conhecimentos sobre tecnologias verdes.</p>
    </div>`;

  startBtn.disabled=false;
  startBtn.innerHTML="Iniciar Jogo";
  resetBtn.disabled=true;
}

startBtn.onclick=startGame;
resetBtn.onclick=resetGame;
resetGame();