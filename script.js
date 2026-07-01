(() => {
const CONFIG = {
    QUESTIONS_PER_QUIZ: 20,
    TIMER_SECONDS: 20,
    TIMER_WARNING_AT: 5,
    QUESTIONS_PER_LEVEL: 75
};
 
   const ANSWER_SALT = 7;
function encodeCorrect(idx) { return (idx + ANSWER_SALT) % 4; }
function decodeCorrect(k) { return (k - ANSWER_SALT + 400) % 4; }

   const AppState = {
    mode: 'formative',
    level: 'kids',
    currentIndex: 0,
    score: 0,
    timer: null,
    timeLeft: CONFIG.TIMER_SECONDS,
    selectedOption: null,
    isLocked: false,
    activeSessionBank: [],   // each entry: { system, stem, options(shuffled), correct(shuffled index), rationale }
    systemScores: {}
};
   const DOM = {
    views: {
        welcome: document.getElementById('view-welcome'),
        assessment: document.getElementById('view-assessment'),
        analytics: document.getElementById('view-analytics')
    },
    controls: {
        globalBack: document.getElementById('btn-global-back'),
        modeSelect: document.getElementById('testing-mode-select'),
        levelGrid: document.getElementById('level-select-grid'),
        initBtn: document.getElementById('btn-initialize-test'),
        submitBtn: document.getElementById('btn-submit-answer'),
        nextBtn: document.getElementById('btn-next-item'),
        finalizeBtn: document.getElementById('btn-finalize-exam'),
        restartBtn: document.getElementById('btn-restart-exam')
    },
    hud: {
        counter: document.getElementById('current-q-num'),
        timerBadge: document.getElementById('hud-timer-badge'),
        timerReadout: document.getElementById('timer-readout'),
        modeDisplay: document.getElementById('hud-mode-display'),
        progressBar: document.getElementById('hud-progress-bar'),
        systemBadge: document.getElementById('hud-system-badge')
    },
    stage: {
        stem: document.getElementById('question-stem-text'),
        matrix: document.getElementById('options-matrix')
    },
    drawer: {
        container: document.getElementById('rationale-drawer'),
        pill: document.getElementById('verdict-pill'),
        text: document.getElementById('rationale-text')
    }
};
   
   DOM.controls.levelGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.level-card');
    if (!card) return;
    DOM.controls.levelGrid.querySelectorAll('.level-card').forEach(c => c.setAttribute('aria-checked', 'false'));
    card.setAttribute('aria-checked', 'true');
    AppState.level = card.dataset.level;
});

   function shuffleArray(sourceArr) {
    let clone = [...sourceArr];
    for (let i = clone.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [clone[i], clone[j]] = [clone[j], clone[i]];
    }
    return clone;
   }

   function shuffleQuestionOptions(rawQuestion) {
    const trueCorrectIdx = decodeCorrect(rawQuestion.k);
    const indices = [0, 1, 2, 3];
    const shuffledIndices = shuffleArray(indices);

    const newOptions = shuffledIndices.map(origIdx => rawQuestion.options[origIdx]);
    const newCorrectIdx = shuffledIndices.indexOf(trueCorrectIdx);

    return {
        system: rawQuestion.system,
        stem: rawQuestion.stem,
        options: newOptions,
        correct: newCorrectIdx,
        rationale: rawQuestion.rationale
    };
   }

   function startTimer() {
    clearInterval(AppState.timer);
    AppState.timeLeft = CONFIG.TIMER_SECONDS;
    DOM.hud.timerReadout.innerText = `${CONFIG.TIMER_SECONDS}s`;
    DOM.hud.timerBadge.className = "hud-timer-badge";

    AppState.timer = setInterval(() => {
        AppState.timeLeft--;
        DOM.hud.timerReadout.innerText = `${AppState.timeLeft}s`;

        if (AppState.timeLeft === CONFIG.TIMER_WARNING_AT) DOM.hud.timerBadge.classList.add('timer-warning');
        if (AppState.timeLeft <= 0) {
            clearInterval(AppState.timer);
            handleTimeExpiration();
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(AppState.timer);
    DOM.hud.timerBadge.classList.remove('timer-warning');
}

function handleTimeExpiration() {
    AppState.isLocked = true;
    DOM.hud.timerBadge.className = "hud-timer-badge timer-expired";
    DOM.hud.timerReadout.innerText = "EXP";

    const allOptions = DOM.stage.matrix.querySelectorAll('.quiz-option');
    allOptions.forEach(opt => opt.disabled = true);
    DOM.controls.submitBtn.disabled = true;

    const currentItem = AppState.activeSessionBank[AppState.currentIndex];
    recordSystemScore(currentItem.system, false);

    if (AppState.mode === 'formative') {
        allOptions[currentItem.correct].classList.add('state-correct');
        DOM.drawer.pill.className = "verdict-pill is-wrong";
        DOM.drawer.pill.innerText = "⏱️ Time's Up!";
        DOM.drawer.text.innerHTML = `<strong>Too slow!</strong> The best answer was: <em>"${currentItem.options[currentItem.correct]}"</em>.<br><br>${currentItem.rationale}`;
        DOM.drawer.container.style.display = 'block';
        showNavigation();
    } else {
        setTimeout(advanceItem, 1500);
    }
}

   function initializeAssessment() {
    AppState.mode = DOM.controls.modeSelect.value;
          const levelPool = QUESTION_BANK[AppState.level];
    const shuffledPool = shuffleArray(levelPool);
    const sessionRaw = shuffledPool.slice(0, CONFIG.QUESTIONS_PER_QUIZ);
    AppState.activeSessionBank = sessionRaw.map(shuffleQuestionOptions);

    AppState.currentIndex = 0;
    AppState.score = 0;
    AppState.systemScores = {};

    DOM.hud.modeDisplay.innerText = AppState.mode === 'formative' ? "Learn & Play" : "Challenge Mode";
    switchView(DOM.views.assessment);
    renderActiveCard();
}

function renderActiveCard() {
    AppState.isLocked = false;
    AppState.selectedOption = null;
    DOM.drawer.container.style.display = 'none';
    DOM.controls.submitBtn.disabled = true;
    DOM.controls.nextBtn.classList.add('hidden');
    DOM.controls.finalizeBtn.classList.add('hidden');

    const currentQ = AppState.activeSessionBank[AppState.currentIndex];

    DOM.hud.counter.innerText = AppState.currentIndex + 1;
    DOM.hud.systemBadge.innerText = `🏷️ ${currentQ.system}`;
    DOM.hud.progressBar.style.width = `${((AppState.currentIndex + 1) / CONFIG.QUESTIONS_PER_QUIZ) * 100}%`;

    DOM.stage.stem.innerText = currentQ.stem;
    DOM.stage.matrix.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];

    currentQ.options.forEach((optText, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quiz-option';
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', 'false');
        btn.innerHTML = `<span class="option-index-key">${letters[idx]}</span><span>${optText}</span>`;
        btn.addEventListener('click', () => selectOption(idx, btn));
        DOM.stage.matrix.appendChild(btn);
    });

    startTimer();
}

function selectOption(idx, btn) {
    if (AppState.isLocked) return;
    DOM.stage.matrix.querySelectorAll('.quiz-option').forEach(b => {
        b.classList.remove('selected');
        b.setAttribute('aria-checked', 'false');
    });
    btn.classList.add('selected');
    btn.setAttribute('aria-checked', 'true');
    AppState.selectedOption = idx;
    DOM.controls.submitBtn.disabled = false;
}

function submitAnswer() {
    if (AppState.selectedOption === null || AppState.isLocked) return;
    stopTimer();
    AppState.isLocked = true;
    DOM.controls.submitBtn.disabled = true;

    const currentQ = AppState.activeSessionBank[AppState.currentIndex];
    const isCorrect = (AppState.selectedOption === currentQ.correct);

    recordSystemScore(currentQ.system, isCorrect);
    if (isCorrect) AppState.score++;

    const opts = DOM.stage.matrix.querySelectorAll('.quiz-option');
    opts.forEach(opt => opt.disabled = true);

    if (AppState.mode === 'formative') {
        opts[currentQ.correct].classList.add('state-correct');
        if (!isCorrect) opts[AppState.selectedOption].classList.add('state-wrong');

        DOM.drawer.pill.className = isCorrect ? "verdict-pill is-correct" : "verdict-pill is-wrong";
        DOM.drawer.pill.innerText = isCorrect ? "Spot On! 🎉" : "Not Quite! 🤔";
        DOM.drawer.text.innerHTML = currentQ.rationale;
        DOM.drawer.container.style.display = 'block';
        showNavigation();
    } else {
        advanceItem();
    }
}

function showNavigation() {
    if (AppState.currentIndex < CONFIG.QUESTIONS_PER_QUIZ - 1) DOM.controls.nextBtn.classList.remove('hidden');
    else DOM.controls.finalizeBtn.classList.remove('hidden');
}

function advanceItem() {
    if (AppState.currentIndex < CONFIG.QUESTIONS_PER_QUIZ - 1) {
        AppState.currentIndex++;
        renderActiveCard();
    } else concludeExamination();
}

function recordSystemScore(sys, correct) {
    if (!AppState.systemScores[sys]) AppState.systemScores[sys] = { total: 0, correct: 0 };
    AppState.systemScores[sys].total++;
    if (correct) AppState.systemScores[sys].correct++;
}

function concludeExamination() {
    stopTimer();
    document.getElementById('final-raw-score').innerText = AppState.score;

    const title = document.getElementById('mastery-tier-title');
    const desc = document.getElementById('mastery-tier-desc');
    const grid = document.getElementById('systemic-breakdown-grid');

    if (AppState.score >= 18) { title.innerText = "Anatomy Superstar! 🌟"; desc.innerText = "Amazing job! You know the human body inside and out!"; }
    else if (AppState.score >= 14) { title.innerText = "Body Explorer! 🗺️"; desc.innerText = "Great job! You're well on your way to mastering human anatomy."; }
    else { title.innerText = "Curious Apprentice! 🌱"; desc.innerText = "Good try! Keep exploring the 3D Atlas to level up your brain power."; }

    grid.innerHTML = '';
    Object.keys(AppState.systemScores).forEach(s => {
        const d = AppState.systemScores[s];
        grid.innerHTML += `<div class="system-score-card"><span class="system-name">${s}</span><span class="system-stat">${d.correct}/${d.total} (${Math.round((d.correct/d.total)*100)}%)</span></div>`;
    });

    switchView(DOM.views.analytics);
}

function switchView(v) {
    Object.values(DOM.views).forEach(screen => screen.classList.remove('active-screen'));
    v.classList.add('active-screen');
    window.scrollTo(0, 0);
}
   const QUESTION_BANK = {
    kids: [
    /* ---- BONES & SKELETON (15) ---- */
    {
        system: "Bones & Skeleton",
        stem: "How many bones does a grown-up human body have?",
        options: ["100 bones", "206 bones", "350 bones", "500 bones"],
        k: 0,
        rationale: "Adults have exactly 206 bones! Babies start with about 300, but many fuse together as you grow up."
    },
    {
        system: "Bones & Skeleton",
        stem: "Which bone protects your brain like a hard helmet?",
        options: ["The ribcage", "The kneecap", "The skull", "The spine"],
        k: 1,
        rationale: "Your skull is made of several bones fused together to create a super-strong helmet that keeps your precious brain safe!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the longest bone in your whole body?",
        options: ["Arm bone", "Shin bone", "Thigh bone", "Foot bone"],
        k: 1,
        rationale: "The thigh bone (femur) is the longest and strongest bone in your body. It goes from your hip all the way down to your knee!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What do we call the place where two bones meet and let you bend?",
        options: ["A muscle", "A joint", "A nerve", "A vein"],
        k: 0,
        rationale: "Joints are the clever hinges of your body! Without them you couldn't bend your knees, elbows, or fingers."
    },
    {
        system: "Bones & Skeleton",
        stem: "What is inside your big bones that makes red blood cells?",
        options: ["Jelly beans", "Water", "Bone marrow", "Air"],
        k: 1,
        rationale: "Bone marrow is like a tiny factory inside your bones that works non-stop making millions of new red blood cells every second!"
    },
    {
        system: "Bones & Skeleton",
        stem: "Which food helps build strong, hard bones?",
        options: ["Candy", "Chips", "Milk and cheese", "Soda"],
        k: 1,
        rationale: "Milk, cheese, and yogurt are packed with calcium — the mineral that makes your bones hard and strong like concrete!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the name of your backbone that runs down the middle of your back?",
        options: ["The sternum", "The spine", "The pelvis", "The femur"],
        k: 0,
        rationale: "Your spine is a stack of 33 ring-shaped bones. It holds you upright and protects the big bundle of nerves running down your back!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What smooth, rubbery material stops your bones from grinding together?",
        options: ["Skin", "Fat", "Cartilage", "Muscle"],
        k: 1,
        rationale: "Cartilage is super slippery! It covers the ends of your bones so they glide smoothly. Your ears and nose tip are also made of cartilage."
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the name of the round bone that covers the front of your knee?",
        options: ["Patella", "Fibula", "Radius", "Tibia"],
        k: 3,
        rationale: "The patella (kneecap) acts like a little shield protecting your knee joint. It also helps your leg muscles work more powerfully when you kick!"
    },
    {
        system: "Bones & Skeleton",
        stem: "The bones of your fingers and toes have a special name. What is it?",
        options: ["Carpals", "Tarsals", "Phalanges", "Metatarsals"],
        k: 1,
        rationale: "You have 14 phalanges in each hand and 14 in each foot. They let you pick things up, write, and grip your favorite toys!"
    }, 
        {
        system: "Bones & Skeleton",
        stem: "What connects one bone to another bone across a joint?",
        options: ["Tendons", "Ligaments", "Muscles", "Cartilage"],
        k: 0,
        rationale: "Ligaments are strong, stretchy bands that hold bones together. Remember: Ligaments link bone to bone!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the flat bone in the middle of your chest called?",
        options: ["Clavicle", "Scapula", "Sternum", "Humerus"],
        k: 1,
        rationale: "The sternum (breastbone) is shaped like a flat tie and sits right in the middle of your chest, connecting your ribs together."
    },
    {
        system: "Bones & Skeleton",
        stem: "Which bone in your body can you NOT move on purpose?",
        options: ["Your finger bone", "Your knee", "Your skull bones", "Your elbow"],
        k: 1,
        rationale: "All the bones of your skull are locked tightly together — except your lower jaw! The skull can't move because it needs to stay firm to protect your brain."
    },
    {
        system: "Bones & Skeleton",
        stem: "What are the flat, wing-shaped bones on your upper back called?",
        options: ["Shoulder blades", "Hip bones", "Collar bones", "Wrist bones"],
        k: 3,
        rationale: "Your shoulder blades (scapulae) slide around on your back when you move your arms, giving your shoulder muscles a wide surface to pull against!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the tiny tailbone at the very bottom of your spine called?",
        options: ["Sacrum", "Atlas", "Coccyx", "Axis"],
        k: 1,
        rationale: "The coccyx is your tiny tailbone made of a few small fused bones. It's actually the leftover trace of a tail from our ancient evolutionary ancestors!"
    },

    /* ---- MUSCLES (15) ---- */
    {
        system: "Muscles",
        stem: "Roughly how many muscles do you have in your body?",
        options: ["Over 600", "Exactly 100", "About 30", "Over 2000"],
        k: 3,
        rationale: "You have over 600 muscles! They make up about 40% of your body weight and help you do everything from blinking your eyes to jumping as high as you can!"
    },
    {
        system: "Muscles",
        stem: "Which muscle never ever stops working, even when you are sleeping?",
        options: ["Your arm muscle", "Your leg muscle", "Your tummy muscle", "Your heart muscle"],
        k: 2,
        rationale: "Your heart is a special muscle that beats over 100,000 times every single day without ever taking a break — not even for a single second!"
    },
    {
        system: "Muscles",
        stem: "What do we call the strong cords that tie your muscles to your bones?",
        options: ["Ligaments", "Nerves", "Tendons", "Veins"],
        k: 1,
        rationale: "Tendons are like strong ropes that attach muscles to bones. When a muscle contracts and gets shorter, it pulls the tendon, which moves the bone!"
    },
    {
        system: "Muscles",
        stem: "When you flex your arm to show your muscles, which muscle makes the bump?",
        options: ["Triceps", "Deltoid", "Biceps", "Hamstring"],
        k: 1,
        rationale: "The biceps muscle on the front of your upper arm makes that famous bump when you flex! The word biceps means 'two heads' because it has two parts."
    },
    {
        system: "Muscles",
        stem: "What does your body do with your muscles when you are cold to make heat?",
        options: ["Stretches them", "Shakes and shivers them", "Grows new ones", "Shrinks them"],
        k: 0,
        rationale: "Shivering is your body's built-in heater! Your muscles shake really fast to create warmth when you're feeling chilly."
    },
    {
        system: "Muscles",
        stem: "Which is the biggest muscle in your whole body?",
        options: ["Arm muscle", "Chest muscle", "Bottom muscle", "Calf muscle"],
        k: 1,
        rationale: "Your gluteus maximus (bottom muscle) is the biggest! It needs to be super strong because it keeps your whole upper body standing tall and upright."
    },
    {
        system: "Muscles",
        stem: "Can muscles push bones, or can they only pull bones?",
        options: ["Only push", "Only pull", "Both push and pull", "Neither"],
        k: 0,
        rationale: "Muscles can only pull! That's why they work in pairs — one muscle pulls the bone one way, and the opposite muscle pulls it back the other way."
    },
    {
        system: "Muscles",
        stem: "Which big flat muscle below your lungs helps you breathe in?",
        options: ["Abdominals", "Diaphragm", "Trapezius", "Quadriceps"],
        k: 0,
        rationale: "The diaphragm is your main breathing muscle! When it flattens down, it creates space for your lungs to fill with air. When it spasms, you get hiccups!"
    },
    {
        system: "Muscles",
        stem: "What happens to your muscles if you exercise them regularly?",
        options: ["They disappear", "They get thinner", "They get bigger and stronger", "They turn to bone"],
        k: 1,
        rationale: "Exercise creates tiny micro-tears in your muscle fibres. When they heal, they grow back thicker and stronger — that's how your muscles get bigger over time!"
    },
    {
        system: "Muscles",
        stem: "What type of muscle automatically moves food through your stomach without you thinking about it?",
        options: ["Skeletal muscle", "Smooth muscle", "Heart muscle", "Arm muscle"],
        k: 0,
        rationale: "Smooth muscle works on autopilot inside your organs! You never have to think about moving food through your stomach — your smooth muscles just do it automatically."
    },
    {
        system: "Muscles",
        stem: "Which muscle on the back of your ankle is the thickest, strongest tendon in your body?",
        options: ["The Achilles tendon", "The kneecap tendon", "The hip tendon", "The shoulder tendon"],
        k: 3,
        rationale: "The Achilles tendon connects your calf muscle to your heel bone. It's named after the Greek hero Achilles and lets you push off the ground when you run and jump!"
    },
    {
        system: "Muscles",
        stem: "How many muscles does it take to smile?",
        options: ["Only 2", "About 17", "Exactly 50", "Over 100"],
        k: 0,
        rationale: "Smiling uses about 17 muscles in your face! Frowning actually uses more muscles, so smiling is the easier and happier choice!"
    },
    {
        system: "Muscles",
        stem: "What is the fastest-moving muscle in your body?",
        options: ["Your tongue", "Your eyelid", "Your finger", "Your toe"],
        k: 0,
        rationale: "Your eyelid blink muscle is lightning fast — it snaps shut in less than 1/100th of a second to protect your eye from dust and bright flashes!"
    },
    {
        system: "Muscles",
        stem: "What food nutrient helps your muscles grow and repair after exercise?",
        options: ["Sugar", "Fat", "Protein", "Vitamins"],
        k: 1,
        rationale: "Protein is the building block of muscles! Foods like eggs, chicken, fish, beans, and nuts give your muscles the materials they need to grow stronger."
    },
    {
        system: "Muscles",
        stem: "What do muscles burn to create energy for you to run and play?",
        options: ["Calcium", "Oxygen and glucose (sugar)", "Fat only", "Water only"],
        k: 0,
        rationale: "Your muscles mix glucose (sugar from food) with oxygen from breathing to make energy — like a tiny engine burning fuel to make your body move!"
    },

    /* ---- HEART & LUNGS (15) ---- */
    {
        system: "Heart & Lungs",
        stem: "About how big is your heart?",
        options: ["As big as your head", "As big as your fist", "As big as your foot", "As big as your thumb"],
        k: 0,
        rationale: "Your heart is roughly the same size as your closed fist! It sits snugly in the middle of your chest and grows right along with you."
    },
    {
        system: "Heart & Lungs",
        stem: "What does your heart do all day and all night?",
        options: ["Digests food", "Pumps blood around your body", "Sends nerve signals", "Makes hormones"],
        k: 0,
        rationale: "Your heart is a pumping superstar! It beats about 100,000 times a day, sending blood carrying oxygen and nutrients to every single cell in your body."
    },
    {
        system: "Heart & Lungs",
        stem: "What do your lungs collect from the air when you breathe in?",
        options: ["Carbon dioxide", "Nitrogen", "Oxygen", "Water vapour"],
        k: 1,
        rationale: "Every breath you take pulls oxygen into your lungs. Your blood picks it up and delivers it to every cell in your body so they can make energy!"
    },
    {
        system: "Heart & Lungs",
        stem: "What gas do you breathe OUT of your lungs?",
        options: ["Oxygen", "Nitrogen", "Helium", "Carbon dioxide"],
        k: 2,
        rationale: "When your body uses oxygen to make energy, it produces carbon dioxide as a waste gas. Your lungs breathe it out — and plants love to absorb it!"
    },
    {
        system: "Heart & Lungs",
        stem: "What colour is your blood really inside your body?",
        options: ["Bright blue", "Dark red", "Clear", "Orange"],
        k: 0,
        rationale: "Your blood is always red — never blue! Blood carrying lots of oxygen is bright red, and blood that has given its oxygen away turns a darker red."
    },
    {
        system: "Heart & Lungs",
        stem: "What are the tubes called that carry blood AWAY from your heart?",
        options: ["Veins", "Arteries", "Capillaries", "Tendons"],
        k: 0,
        rationale: "Arteries carry blood away from the heart! They have thick walls because the heart pushes blood into them with a strong squeeze."
    },
    {
        system: "Heart & Lungs",
        stem: "What are the tubes called that carry blood BACK to your heart?",
        options: ["Arteries", "Veins", "Nerves", "Capillaries"],
        k: 0,
        rationale: "Veins return tired blood back to your heart. They have one-way valves inside them so blood can't flow backwards down your legs!"
    },
    {
        system: "Heart & Lungs",
        stem: "How many lungs do you have?",
        options: ["One", "Two", "Three", "Four"],
        k: 0,
        rationale: "You have two lungs — a left and a right! Your left lung is slightly smaller than the right one to make room for your heart sitting next to it."
    },
       {   
   
   
   
