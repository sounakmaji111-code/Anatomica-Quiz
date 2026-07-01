(() => {

const CONFIG = {
    QUESTIONS_PER_QUIZ: 20,
    TIMER_SECONDS: 20,
    TIMER_WARNING_AT: 5,
    QUESTIONS_PER_LEVEL: 75
};

async function sha256(text) {
    const normalized = text.trim().toLowerCase();
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function findCorrectIndex(options, correctHash) {
    for (let i = 0; i < options.length; i++) {
        const h = await sha256(options[i]);
        if (h === correctHash) return i;
    }
    return -1; // should never happen if data is correct
}

const AppState = {
    mode: 'formative',
    level: 'kids',
    currentIndex: 0,
    score: 0,
    timer: null,
    timeLeft: CONFIG.TIMER_SECONDS,
    selectedOption: null,
    isLocked: false,
    activeSessionBank: [],   // each entry: { system, stem, options(shuffled), correctIndex(resolved), rationale }
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

/* ==========================================================================
   2. LEVEL SELECTOR WIRING
   ========================================================================== */
DOM.controls.levelGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.level-card');
    if (!card) return;
    DOM.controls.levelGrid.querySelectorAll('.level-card').forEach(c => c.setAttribute('aria-checked', 'false'));
    card.setAttribute('aria-checked', 'true');
    AppState.level = card.dataset.level;
});

/* ==========================================================================
   3. SHUFFLE HELPERS
   ========================================================================== */
function shuffleArray(sourceArr) {
    let clone = [...sourceArr];
    for (let i = clone.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [clone[i], clone[j]] = [clone[j], clone[i]];
    }
    return clone;
}

async function prepareQuestion(rawQuestion) {
    const shuffledOptions = shuffleArray(rawQuestion.options);
    const correctIndex = await findCorrectIndex(shuffledOptions, rawQuestion.correctHash);
    return {
        system: rawQuestion.system,
        stem: rawQuestion.stem,
        options: shuffledOptions,
        correctIndex: correctIndex,
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
        allOptions[currentItem.correctIndex].classList.add('state-correct');
        DOM.drawer.pill.className = "verdict-pill is-wrong";
        DOM.drawer.pill.innerText = "⏱️ Time's Up!";
        DOM.drawer.text.innerHTML = `<strong>Too slow!</strong> The best answer was: <em>"${currentItem.options[currentItem.correctIndex]}"</em>.<br><br>${currentItem.rationale}`;
        DOM.drawer.container.style.display = 'block';
        showNavigation();
    } else {
        setTimeout(advanceItem, 1500);
    }
}

async function initializeAssessment() {
    AppState.mode = DOM.controls.modeSelect.value;

    DOM.controls.initBtn.disabled = true;
    DOM.controls.initBtn.innerText = "Loading...";

    const levelPool = QUESTION_BANK[AppState.level];
    const shuffledPool = shuffleArray(levelPool);
    const sessionRaw = shuffledPool.slice(0, CONFIG.QUESTIONS_PER_QUIZ);

    // Resolve all hashes up front (parallel) before starting the quiz
    AppState.activeSessionBank = await Promise.all(sessionRaw.map(prepareQuestion));

    AppState.currentIndex = 0;
    AppState.score = 0;
    AppState.systemScores = {};

    DOM.hud.modeDisplay.innerText = AppState.mode === 'formative' ? "Learn & Play" : "Challenge Mode";
    DOM.controls.initBtn.disabled = false;
    DOM.controls.initBtn.innerHTML = "<span>Start Adventure! 🚀</span>";

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
    const prevSelected = DOM.stage.matrix.querySelector('.quiz-option.selected');
    if (prevSelected && prevSelected !== btn) {
        prevSelected.classList.remove('selected');
        prevSelected.setAttribute('aria-checked', 'false');
    }
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
    const isCorrect = (AppState.selectedOption === currentQ.correctIndex);

    recordSystemScore(currentQ.system, isCorrect);
    if (isCorrect) AppState.score++;

    const opts = DOM.stage.matrix.querySelectorAll('.quiz-option');
    opts.forEach(opt => opt.disabled = true);

    if (AppState.mode === 'formative') {
        opts[currentQ.correctIndex].classList.add('state-correct');
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

/* ==========================================================================
   6. QUESTION_BANK — filled in across the next parts as:
      QUESTION_BANK = { kids: [...75], highschool: [...75], advanced: [...75] }
      Each raw question: { system, stem, options: [4 strings], correctHash: "<sha256 of correct option text>", rationale }
      NOTE: correctHash values are pre-computed — never derived from a visible index.
   ========================================================================== */
const QUESTION_BANK = {
    kids: [
    {
        system: "Bones & Skeleton",
        stem: "How many bones does a grown-up human body have?",
        options: ["100 bones","206 bones","350 bones","500 bones"],
        correctHash: "6a8698f8fe1ed22fa714022859c0b43e13145b07bde39d3399b3b985a5cc74a6",
        rationale: "Adults have exactly 206 bones! Babies start with about 300, but many fuse together as you grow up."
    },
    {
        system: "Bones & Skeleton",
        stem: "Which bone protects your brain like a hard helmet?",
        options: ["The ribcage","The kneecap","The skull","The spine"],
        correctHash: "42b99ca494cb4d9f76966a9e72d1ca6dd79a6601de66da87ac1a14a52206c8e0",
        rationale: "Your skull is made of several bones fused together to create a super-strong helmet that keeps your precious brain safe!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the longest bone in your whole body?",
        options: ["Arm bone","Shin bone","Thigh bone","Foot bone"],
        correctHash: "9aaa6bebf1d9ce06a9dc79f7d35ca26f50c29113a465c4c48815143201236b40",
        rationale: "The thigh bone (femur) is the longest and strongest bone in your body. It goes from your hip all the way down to your knee!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What do we call the place where two bones meet and let you bend?",
        options: ["A muscle","A joint","A nerve","A vein"],
        correctHash: "19fa2c78dc9c69ba39ff15b102bf240f96765486da7bc6012b2c95867be6870e",
        rationale: "Joints are the clever hinges of your body! Without them you couldn't bend your knees, elbows, or fingers."
    },
    {
        system: "Bones & Skeleton",
        stem: "What is inside your big bones that makes red blood cells?",
        options: ["Jelly beans","Water","Bone marrow","Air"],
        correctHash: "fa9a11e89d02165ce6258386bbd10f960aefaa37128920d4f606d186357da4f5",
        rationale: "Bone marrow is like a tiny factory inside your bones that works non-stop making millions of new red blood cells every second!"
    },
    {
        system: "Bones & Skeleton",
        stem: "Which food helps build strong, hard bones?",
        options: ["Candy","Chips","Milk and cheese","Soda"],
        correctHash: "064f1fe1fc91fb39ca4af03f7509e5d195f07f7593556e0271287b9c590d359b",
        rationale: "Milk, cheese, and yogurt are packed with calcium — the mineral that makes your bones hard and strong like concrete!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the name of your backbone that runs down the middle of your back?",
        options: ["The sternum","The spine","The pelvis","The femur"],
        correctHash: "bedece226c96dcbf71697b99afc34e5040a0a1027f224e0fe6e9b9fbbe97cdbd",
        rationale: "Your spine is a stack of 33 ring-shaped bones. It holds you upright and protects the big bundle of nerves running down your back!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What smooth, rubbery material stops your bones from grinding together?",
        options: ["Skin","Fat","Cartilage","Muscle"],
        correctHash: "33211d6098fd5d7ee522bdca0713e1a3635afeaa08cf2680ae2898db929d86a3",
        rationale: "Cartilage is super slippery! It covers the ends of your bones so they glide smoothly. Your ears and nose tip are also made of cartilage."
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the name of the round bone that covers the front of your knee?",
        options: ["Patella","Fibula","Radius","Tibia"],
        correctHash: "bd0224d65cf1fec9b2c0b10a7838608fe2b8b12a4318e115cb4f887da6b4e14b",
        rationale: "The patella (kneecap) acts like a little shield protecting your knee joint. It also helps your leg muscles work more powerfully when you kick!"
    },
    {
        system: "Bones & Skeleton",
        stem: "The bones of your fingers and toes have a special name. What is it?",
        options: ["Carpals","Tarsals","Phalanges","Metatarsals"],
        correctHash: "e924ce8ea66619377518322e37ebc65e58e12a1a100f55707491d137a8e834bb",
        rationale: "You have 14 phalanges in each hand and 14 in each foot. They let you pick things up, write, and grip your favorite toys!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What connects one bone to another bone across a joint?",
        options: ["Tendons","Ligaments","Muscles","Cartilage"],
        correctHash: "f6411630cdc02f143c1dcff307e989f79160e91c03680b62d697d587e4e4e914",
        rationale: "Ligaments are strong, stretchy bands that hold bones together. Remember: Ligaments link bone to bone!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the flat bone in the middle of your chest called?",
        options: ["Clavicle","Scapula","Sternum","Humerus"],
        correctHash: "fbb1c44b5612e7be5573b9c62566687946faf8ebd363a960ebcbdc73ee8c4ac3",
        rationale: "The sternum (breastbone) is shaped like a flat tie and sits right in the middle of your chest, connecting your ribs together."
    },
    {
        system: "Bones & Skeleton",
        stem: "Which bone in your body can you NOT move on purpose?",
        options: ["Your finger bone","Your knee","Your skull bones","Your elbow"],
        correctHash: "0020c0829288bc8cb7fb5fc6916fb796b76302451e3c54c703e6b9848aa17811",
        rationale: "All the bones of your skull are locked tightly together — except your lower jaw! The skull can't move because it needs to stay firm to protect your brain."
    },
    {
        system: "Bones & Skeleton",
        stem: "What are the flat, wing-shaped bones on your upper back called?",
        options: ["Shoulder blades","Hip bones","Collar bones","Wrist bones"],
        correctHash: "324a1851baea5aa7e57c73b852bcc5554ae3b5c12c89b85978f2c80316f576cf",
        rationale: "Your shoulder blades (scapulae) slide around on your back when you move your arms, giving your shoulder muscles a wide surface to pull against!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the tiny tailbone at the very bottom of your spine called?",
        options: ["Sacrum","Atlas","Coccyx","Axis"],
        correctHash: "a1549ee41b46cdba26f333bc60bbcc6516147292c9dfe4d253b8c934f2057c8f",
        rationale: "The coccyx is your tiny tailbone made of a few small fused bones. It's actually the leftover trace of a tail from our ancient evolutionary ancestors!"
    },
    {
        system: "Muscles",
        stem: "Roughly how many muscles do you have in your body?",
        options: ["Over 600","Exactly 100","About 30","Over 2000"],
        correctHash: "6547374d1495f78e7ef1fe2775609e8f04e7c0055de7be55f0c16d94ba2c2cd7",
        rationale: "You have over 600 muscles! They make up about 40% of your body weight and help you do everything from blinking your eyes to jumping as high as you can!"
    },
    {
        system: "Muscles",
        stem: "Which muscle never ever stops working, even when you are sleeping?",
        options: ["Your arm muscle","Your leg muscle","Your tummy muscle","Your heart muscle"],
        correctHash: "5cbda989f3be37c1b1b33aae1654bff1df50c19b7a41701716a04212c1c1dd39",
        rationale: "Your heart is a special muscle that beats over 100,000 times every single day without ever taking a break — not even for a single second!"
    },
    {
        system: "Muscles",
        stem: "What do we call the strong cords that tie your muscles to your bones?",
        options: ["Ligaments","Nerves","Tendons","Veins"],
        correctHash: "71b23c4b19e3bc5c4cf63cbe395b8c3f0b318c1ddd88e742fa7eee5ade82d49e",
        rationale: "Tendons are like strong ropes that attach muscles to bones. When a muscle contracts and gets shorter, it pulls the tendon, which moves the bone!"
    },
    {
        system: "Muscles",
        stem: "When you flex your arm to show your muscles, which muscle makes the bump?",
        options: ["Triceps","Deltoid","Biceps","Hamstring"],
        correctHash: "97d7188289612bcc8471410a7c351110338527fefaddc6e8ffe06b93da56c7dc",
        rationale: "The biceps muscle on the front of your upper arm makes that famous bump when you flex! The word biceps means 'two heads' because it has two parts."
    },
    {
        system: "Muscles",
        stem: "What does your body do with your muscles when you are cold to make heat?",
        options: ["Stretches them","Shakes and shivers them","Grows new ones","Shrinks them"],
        correctHash: "fb05b2f6b5c07e71d9dfec5d77b8dcab2f6d701f712e5d1ba5cbd0f2c4b91663",
        rationale: "Shivering is your body's built-in heater! Your muscles shake really fast to create warmth when you're feeling chilly."
    },
    {
        system: "Muscles",
        stem: "Which is the biggest muscle in your whole body?",
        options: ["Arm muscle","Chest muscle","Bottom muscle","Calf muscle"],
        correctHash: "40deb67e458b79b9e2e4eacfd82fa9ccf59d280d9854efe960df8a1396132640",
        rationale: "Your gluteus maximus (bottom muscle) is the biggest! It needs to be super strong because it keeps your whole upper body standing tall and upright."
    },
    {
        system: "Muscles",
        stem: "Can muscles push bones, or can they only pull bones?",
        options: ["Only push","Only pull","Both push and pull","Neither"],
        correctHash: "2f68ce716cc25e9271258cbd9593b791e86f5abb643d6251e6159bc062f13573",
        rationale: "Muscles can only pull! That's why they work in pairs — one muscle pulls the bone one way, and the opposite muscle pulls it back the other way."
    },
    {
        system: "Muscles",
        stem: "Which big flat muscle below your lungs helps you breathe in?",
        options: ["Abdominals","Diaphragm","Trapezius","Quadriceps"],
        correctHash: "f4004efd1305ee80ab453da11591fb5140c4622d8f04cd769ec40bfa90c8ee66",
        rationale: "The diaphragm is your main breathing muscle! When it flattens down, it creates space for your lungs to fill with air. When it spasms, you get hiccups!"
    },
    {
        system: "Muscles",
        stem: "What happens to your muscles if you exercise them regularly?",
        options: ["They disappear","They get thinner","They get bigger and stronger","They turn to bone"],
        correctHash: "7c05f2b4578e26cef739d72d8fd146915245c6efec13707ef72cfad7242a4f1c",
        rationale: "Exercise creates tiny micro-tears in your muscle fibres. When they heal, they grow back thicker and stronger — that's how your muscles get bigger over time!"
    },
    {
        system: "Muscles",
        stem: "What type of muscle automatically moves food through your stomach without you thinking about it?",
        options: ["Skeletal muscle","Smooth muscle","Heart muscle","Arm muscle"],
        correctHash: "fc202545b883a34e1a6249cdc7686b8fd10abdb24dcc4b69213c88f7f3d20ecb",
        rationale: "Smooth muscle works on autopilot inside your organs! You never have to think about moving food through your stomach — your smooth muscles just do it automatically."
    },
    {
        system: "Muscles",
        stem: "Which muscle on the back of your ankle is the thickest, strongest tendon in your body?",
        options: ["The Achilles tendon","The kneecap tendon","The hip tendon","The shoulder tendon"],
        correctHash: "596ac8a6f2ce701cc2922c4e45387151c52b5c42eee6bfdfcd2ad83b8fde9df9",
        rationale: "The Achilles tendon connects your calf muscle to your heel bone. It's named after the Greek hero Achilles and lets you push off the ground when you run and jump!"
    },
    {
        system: "Muscles",
        stem: "How many muscles does it take to smile?",
        options: ["Only 2","About 17","Exactly 50","Over 100"],
        correctHash: "bdc01fc8ed32a947ea92279f4605e3630738ca823c6a07c5629e49208ab60aa2",
        rationale: "Smiling uses about 17 muscles in your face! Frowning actually uses more muscles, so smiling is the easier and happier choice!"
    },
    {
        system: "Muscles",
        stem: "What is the fastest-moving muscle in your body?",
        options: ["Your tongue","Your eyelid","Your finger","Your toe"],
        correctHash: "c79129a99b98c90d821713e480159d406a7660321bfe8095798a3d9268f51f98",
        rationale: "Your eyelid blink muscle is lightning fast — it snaps shut in less than 1/100th of a second to protect your eye from dust and bright flashes!"
    },
    {
        system: "Muscles",
        stem: "What food nutrient helps your muscles grow and repair after exercise?",
        options: ["Sugar","Fat","Protein","Vitamins"],
        correctHash: "ec871480d85b1756d8afd04cdc76ac6edf875f1d8a4192f74193a362dc7ec180",
        rationale: "Protein is the building block of muscles! Foods like eggs, chicken, fish, beans, and nuts give your muscles the materials they need to grow stronger."
    },
    {
        system: "Muscles",
        stem: "What do muscles burn to create energy for you to run and play?",
        options: ["Calcium","Oxygen and glucose (sugar)","Fat only","Water only"],
        correctHash: "7178efdb279fe78df8e6690c704521db447314b3be3c0d1d163ec44eeda865e7",
        rationale: "Your muscles mix glucose (sugar from food) with oxygen from breathing to make energy — like a tiny engine burning fuel to make your body move!"
    },
    {
        system: "Heart & Lungs",
        stem: "About how big is your heart?",
        options: ["As big as your head","As big as your fist","As big as your foot","As big as your thumb"],
        correctHash: "9a04f105de868a9a6bd3fc30179c31a0d412413b8f476b7739647fa636965f15",
        rationale: "Your heart is roughly the same size as your closed fist! It sits snugly in the middle of your chest and grows right along with you."
    },
    {
        system: "Heart & Lungs",
        stem: "What does your heart do all day and all night?",
        options: ["Digests food","Pumps blood around your body","Sends nerve signals","Makes hormones"],
        correctHash: "5c3f229a33e034ba1d83298d8215daf461dda5fac49c5387d6766a4123f7bd78",
        rationale: "Your heart is a pumping superstar! It beats about 100,000 times a day, sending blood carrying oxygen and nutrients to every single cell in your body."
    },
    {
        system: "Heart & Lungs",
        stem: "What do your lungs collect from the air when you breathe in?",
        options: ["Carbon dioxide","Nitrogen","Oxygen","Water vapour"],
        correctHash: "b982a09b35429d8f87552f1af0a512034e382562cbc792529ed12fd0096e4bef",
        rationale: "Every breath you take pulls oxygen into your lungs. Your blood picks it up and delivers it to every cell in your body so they can make energy!"
    },
    {
        system: "Heart & Lungs",
        stem: "What gas do you breathe OUT of your lungs?",
        options: ["Oxygen","Nitrogen","Helium","Carbon dioxide"],
        correctHash: "ddf74783a6568c47ff2cc7906d8bc06f320c17db02cc7ea0a95ccea39247327e",
        rationale: "When your body uses oxygen to make energy, it produces carbon dioxide as a waste gas. Your lungs breathe it out — and plants love to absorb it!"
    },
    {
        system: "Heart & Lungs",
        stem: "What colour is your blood really inside your body?",
        options: ["Bright blue","Dark red","Clear","Orange"],
        correctHash: "e658cf6005abd09d25c304474e34d30bd5e0b6a57021acf0dad59dd56adfd1e5",
        rationale: "Your blood is always red — never blue! Blood carrying lots of oxygen is bright red, and blood that has given its oxygen away turns a darker red."
    },
    {
        system: "Heart & Lungs",
        stem: "What are the tubes called that carry blood AWAY from your heart?",
        options: ["Veins","Arteries","Capillaries","Tendons"],
        correctHash: "f2d937a64847c6e53548a5ea3af5a027be306e8002be9eb161f39283bf1e1edf",
        rationale: "Arteries carry blood away from the heart! They have thick walls because the heart pushes blood into them with a strong squeeze."
    },
    {
        system: "Heart & Lungs",
        stem: "What are the tubes called that carry blood BACK to your heart?",
        options: ["Arteries","Veins","Nerves","Capillaries"],
        correctHash: "88c709be8c69665122c7ae663d4a50f7099fad79266f49539ed15f8324afd0b0",
        rationale: "Veins return tired blood back to your heart. They have one-way valves inside them so blood can't flow backwards down your legs!"
    },
    {
        system: "Heart & Lungs",
        stem: "How many lungs do you have?",
        options: ["One","Two","Three","Four"],
        correctHash: "3fc4ccfe745870e2c0d99f71f30ff0656c8dedd41cc1d7d3d376b0dbe685e2f3",
        rationale: "You have two lungs — a left and a right! Your left lung is slightly smaller than the right one to make room for your heart sitting next to it."
    },
    {
        system: "Heart & Lungs",
        stem: "When you feel your pulse at your wrist, what are you actually feeling?",
        options: ["Your bones tapping","Your arteries bouncing with each heartbeat","Your nerves tingling","Your muscles twitching"],
        correctHash: "3e8876e77473ae31d12d1d9993a422e1258df9558bd96a74f5fc9c504b5de3bd",
        rationale: "Every time your heart beats it pushes a wave of blood through your arteries, making them bulge slightly. You can feel that gentle bounce as your pulse!"
    },
    {
        system: "Heart & Lungs",
        stem: "What is the name of your main windpipe that carries air down to your lungs?",
        options: ["Esophagus","Trachea","Larynx","Pharynx"],
        correctHash: "330cedf9ff4c9d0ce27cce55431ef0651ba03e88c12709c19fcf2d55ad0f3c48",
        rationale: "Your trachea has stiff C-shaped rings of cartilage keeping it open like a flexible vacuum hose so air can always flow freely down to your lungs!"
    },
    {
        system: "Heart & Lungs",
        stem: "What are the tiny air sacs inside your lungs where oxygen enters your blood?",
        options: ["Bronchi","Alveoli","Capillaries","Ventricles"],
        correctHash: "7df59c701bea4dc4b3c1575870dd34ec32d759135b3eb05905d2056e8357c2bc",
        rationale: "You have about 600 million alveoli in your lungs! These tiny balloon-like sacs have super thin walls so oxygen can easily pass through into your blood."
    },
    {
        system: "Heart & Lungs",
        stem: "What clever flap snaps shut over your windpipe when you swallow food?",
        options: ["The uvula","The epiglottis","The tonsil","The tongue"],
        correctHash: "40876a6a620fd1a302b768fe039185bb659985f49a042226a6ca7b19f5d53c2b",
        rationale: "The epiglottis is like a trapdoor! Every time you swallow it flips down over your windpipe so food goes down your food pipe instead of into your lungs."
    },
    {
        system: "Heart & Lungs",
        stem: "How many chambers (rooms) does your heart have?",
        options: ["Two","Three","Four","Six"],
        correctHash: "04efaf080f5a3e74e1c29d1ca6a48569382cbbcd324e8d59d2b83ef21c039f00",
        rationale: "Your heart has four chambers — two on top (atria) to receive incoming blood, and two on the bottom (ventricles) to pump blood out to your body and lungs!"
    },
    {
        system: "Heart & Lungs",
        stem: "Which type of blood cell carries oxygen around your body?",
        options: ["White blood cells","Red blood cells","Platelets","Plasma"],
        correctHash: "ee131f4b4fbf1c996705fd3ebc990bb1bcc87740b6bd4ce39d5d111549367d7d",
        rationale: "Red blood cells are packed with a special protein called haemoglobin that grabs onto oxygen and carries it like little delivery parcels to every cell in your body!"
    },
    {
        system: "Heart & Lungs",
        stem: "What sticks together to plug a cut and stop you from bleeding?",
        options: ["Red blood cells","White blood cells","Platelets","Plasma"],
        correctHash: "af6d3f7f92ab360de17a2b162e7caff366c598a81f0023df07adffb9fcd59a06",
        rationale: "Platelets are tiny cell fragments that rush to any cut and clump together to build a sticky plug — that's what eventually forms the scab you see on a scrape!"
    },
    {
        system: "Digestion",
        stem: "Where does digestion start?",
        options: ["In your stomach","In your mouth","In your intestines","In your throat"],
        correctHash: "54e22464d59f48845c73d1f71d18cfc3751fe6019fec2c8250d25bbb9d4c5220",
        rationale: "Digestion begins the moment you take a bite! Your teeth chew food into smaller pieces and your saliva starts breaking it down straight away."
    },
    {
        system: "Digestion",
        stem: "What does your stomach make to help break down food?",
        options: ["Saliva","Bile","Stomach acid","Blood"],
        correctHash: "1b1da401c665d50afa09d279233939b3ea2b718d76296095f89bcd8ad052328e",
        rationale: "Your stomach makes a very strong acid that breaks food down into a liquid mush. A special layer of slime protects your stomach walls from being burned by its own acid!"
    },
    {
        system: "Digestion",
        stem: "What is the long twisty tube that absorbs nutrients from your food?",
        options: ["Large intestine","Small intestine","Esophagus","Stomach"],
        correctHash: "a19ff47080ddd55017fdfe171314c76ac1f603b1fdb3c6e856f890483190ddee",
        rationale: "Your small intestine is actually over 20 feet long even though it is narrow! It absorbs almost all the vitamins and nutrients from your food."
    },
    {
        system: "Digestion",
        stem: "What is the main job of the large intestine?",
        options: ["Make stomach acid","Absorb water from waste","Produce bile","Chew food"],
        correctHash: "30068a7b2e45d4c14a0bd4933fdc12c791110a62881cb1a462834ef679a21081",
        rationale: "The large intestine is like a water recycling machine! It soaks up leftover water from your food waste so your body stays hydrated."
    },
    {
        system: "Digestion",
        stem: "Which organ cleans your blood and does over 500 jobs at once?",
        options: ["Kidneys","Stomach","Liver","Pancreas"],
        correctHash: "ebaf48a9725795ea8b3a5e458be64fd1be59d9e8d35141a6bb698ad98c1a0641",
        rationale: "Your liver is an amazing multitasker! It filters toxins out of your blood, stores energy, and produces bile to help digest fatty foods."
    },
    {
        system: "Digestion",
        stem: "What liquid does the liver make to break down fatty foods like butter and cheese?",
        options: ["Saliva","Bile","Acid","Insulin"],
        correctHash: "bb3be5d12d4e85f6a02c454e868f16c3050a54f648a073d4c099976e5b14b8e9",
        rationale: "Bile is a green liquid that works exactly like dish soap — it breaks big globs of fat into tiny droplets so your body can absorb them easily!"
    },
    {
        system: "Digestion",
        stem: "What is the name of the food pipe that carries food from your mouth down to your stomach?",
        options: ["Trachea","Esophagus","Urethra","Intestine"],
        correctHash: "508467d08735632203b11f71c9fb6ae1572e3414d2cdc0264313a9577e8ac83d",
        rationale: "The esophagus squeezes food down to your stomach using wave-like muscle movements. It's so powerful it can push food down even if you were hanging upside down!"
    },
    {
        system: "Digestion",
        stem: "What is the watery liquid in your mouth that starts digestion?",
        options: ["Bile","Acid","Saliva","Plasma"],
        correctHash: "020ffaad0678c8d6ade519ec5505ce682530a010e23865bbf9d226918b606569",
        rationale: "Saliva keeps your mouth moist, contains enzymes that begin breaking down food, and makes food slippery enough to swallow. You make about 1-2 litres every day!"
    },
    {
        system: "Digestion",
        stem: "What are the tiny finger-like bumps inside your small intestine that absorb nutrients?",
        options: ["Cilia","Villi","Alveoli","Pores"],
        correctHash: "fa72fbd95af7d2eb7d0860e02623500202dcc16a3413da24b58956609b669e7c",
        rationale: "Villi are millions of tiny absorbing bumps that give your intestine as much surface area as a whole tennis court — making sure nothing good goes to waste!"
    },
    {
        system: "Digestion",
        stem: "Which organ sits beside your stomach and makes insulin to control sugar levels?",
        options: ["The liver","The pancreas","The gallbladder","The spleen"],
        correctHash: "e72491260430d5de7d0e51985ebb67b7caac214958b3845d065a939f8c23144f",
        rationale: "The pancreas does two big jobs! It makes digestive enzymes to break down food, and produces insulin to keep your blood sugar at a healthy level."
    },
    {
        system: "Digestion",
        stem: "About how long does it take for food to travel all the way through your digestive system?",
        options: ["10 minutes","1 hour","24 to 72 hours","One week"],
        correctHash: "a4e604a6ba4274515e05867b037b572c5f27eec26422a51c23c3784d29ba6636",
        rationale: "Digestion is a slow journey! While food leaves your stomach after a few hours, it can take up to three whole days to complete the full trip through your intestines."
    },
    {
        system: "Digestion",
        stem: "What is the hardest substance your body makes?",
        options: ["Bone","Fingernail","Tooth enamel","Cartilage"],
        correctHash: "678455d6d337e2f28d285c8635fccefe5fd6d3468be616e0a4eb5b03503f5b38",
        rationale: "Tooth enamel is even harder than bone! It coats the outside of your teeth to protect them while you chew tough and crunchy foods."
    },
    {
        system: "Digestion",
        stem: "What causes the rumbling sound in your tummy when you're hungry?",
        options: ["Your bones grinding","Air and juices moving through empty intestines","Your heart beating","Your blood flowing"],
        correctHash: "ee2e0db662b5e1b974ab495d8210fb224b201b1b2085c67bae246952fce76207",
        rationale: "When your stomach and intestines are empty, the muscles still squeeze automatically — and that makes the gurgling and rumbling sound you hear when you're hungry!"
    },
    {
        system: "Digestion",
        stem: "What do your kidneys produce to flush waste out of your body?",
        options: ["Bile","Saliva","Urine (pee)","Sweat"],
        correctHash: "af657887e4f26117b5abe73e6d0bb73200697c7f050d2530d35ca6f39795bf39",
        rationale: "Your two kidneys filter your entire blood supply about 40 times every day, removing waste and extra water to make yellow urine stored in your bladder!"
    },
    {
        system: "Digestion",
        stem: "When you burp after drinking fizzy soda, where does the burp come from?",
        options: ["Your lungs","Your stomach","Your intestines","Your throat"],
        correctHash: "476e11cf25127ad604f020bdcfa9df9033b741a7d2eeb0bdb8aef8a31e9b4c15",
        rationale: "Fizzy drinks are full of carbon dioxide bubbles! The bubbles collect in your stomach until the top opens up and lets them escape as a big burp!"
    },
    {
        system: "Brain & Senses",
        stem: "What is the name of the amazing organ inside your head that controls everything you do?",
        options: ["The heart","The liver","The brain","The stomach"],
        correctHash: "2eb51631257258fe17ace1a8bac25572cb5e9e126d222c5f14e431e45ddbf84d",
        rationale: "Your brain is your body's supercomputer! It controls your thoughts, movements, feelings, and automatically runs all your vital body functions."
    },
    {
        system: "Brain & Senses",
        stem: "How many senses do humans have?",
        options: ["Three","Four","Five","Seven"],
        correctHash: "222b0bd51fcef7e65c2e62db2ed65457013bab56be6fafeb19ee11d453153c80",
        rationale: "The five main senses are sight, hearing, smell, taste, and touch! Each one collects information from the world around you and sends it to your brain."
    },
    {
        system: "Brain & Senses",
        stem: "What do your eyes use to let in light?",
        options: ["The iris","The pupil","The cornea","The retina"],
        correctHash: "cedfa068ba80e56ee6afc6acc64c1704fd7cd6f096ea6375985a35f3dcf52cfb",
        rationale: "Your pupil is the dark circle in the middle of your eye. It's actually an opening that gets bigger in the dark to let in more light and smaller in bright sunshine!"
    },
    {
        system: "Brain & Senses",
        stem: "What is the coloured ring around your pupil called?",
        options: ["Cornea","Retina","Iris","Lens"],
        correctHash: "47612b3175fece07f6c3e91992412c5b16ca88a9068cb72fecbcf653eb5ffcd7",
        rationale: "Your iris can be blue, green, brown, hazel, or grey — no two people have the exact same iris pattern! It controls how much light enters your eye."
    },
    {
        system: "Brain & Senses",
        stem: "Which body part do you use to hear sounds?",
        options: ["Your nose","Your eyes","Your ears","Your tongue"],
        correctHash: "0a8a247b8321d5ddaff0096930fec8cc3ec4df5dd5f31195448f8a2d32ca311b",
        rationale: "Sound waves travel into your ear canal and make your eardrum vibrate. Those vibrations are turned into signals that your brain understands as sound!"
    },
    {
        system: "Brain & Senses",
        stem: "What are the tiny bumps on your tongue that detect flavours called?",
        options: ["Villi","Taste buds","Papillae","Cilia"],
        correctHash: "d1ee5054d89489ce4605708f4ad88046bfbfbc9093ad62a4c6da0116855f9486",
        rationale: "You have around 10,000 taste buds spread across your tongue! They can detect sweet, salty, sour, bitter, and savoury flavours."
    },
    {
        system: "Brain & Senses",
        stem: "What connects your brain to the rest of your body through your spine?",
        options: ["Spinal cord","Backbone","Aorta","Trachea"],
        correctHash: "49c01152935ede9458cbbb5cac379ad5e88b86fbc93cd160ffcbf7adbded33dd",
        rationale: "The spinal cord is a thick bundle of nerves running through your backbone. It carries messages from your brain to your muscles and brings information back up!"
    },
    {
        system: "Brain & Senses",
        stem: "Why does food taste boring when you have a blocked nose?",
        options: ["Your tongue stops working","Taste and smell work together","Your saliva dries up","Your throat swells shut"],
        correctHash: "02e522f036d1ba019ef551111d0ced12df3ed1b8606dc93e32345b8572398d03",
        rationale: "Most of what we call 'taste' is actually smell! When your nose is blocked, the aroma of food can't reach your smell receptors, so flavours seem dull and flat."
    },
    {
        system: "Brain & Senses",
        stem: "What part of the brain at the back of your head helps you keep your balance?",
        options: ["Cerebrum","Brainstem","Cerebellum","Amygdala"],
        correctHash: "9aa72e4fb1ff63e1792b1ec7dcac104a5c7d458b61bd127b740fcdc428ed8784",
        rationale: "The cerebellum fine-tunes all your movements and keeps you balanced. Without it you would wobble and stumble trying to walk in a straight line!"
    },
    {
        system: "Brain & Senses",
        stem: "Why do you blink your eyes without thinking about it?",
        options: ["To rest your eyeballs","To spread tears and clean your eyes","To focus on objects","To let in more light"],
        correctHash: "670e437a50962af5b9db5f8cb1a022ed7a2359ee1f1d0322e470942cad23fa4d",
        rationale: "You blink about 15-20 times a minute automatically! Each blink coats your eye with a fresh layer of tears that washes away dust and keeps your vision crystal clear."
    },
    {
        system: "Brain & Senses",
        stem: "What are the tiny nerve cells in your brain called?",
        options: ["Neurons","Nephrons","Platelets","Alveoli"],
        correctHash: "ad523424f063161f83283ba684d3355106a1c2e4a4e0c6024bfde8c2507f102c",
        rationale: "You have billions of neurons in your brain! They send tiny electrical signals to each other at incredible speeds, creating every thought and feeling you have."
    },
    {
        system: "Brain & Senses",
        stem: "Which part of your brain is in charge of your feelings like happiness and fear?",
        options: ["Cerebrum","Brainstem","Cerebellum","Amygdala"],
        correctHash: "13a552b6ffc4aac3b85a50ca80890061d77f20d39fbf1236541edfa07748d6c8",
        rationale: "The amygdala is a tiny almond-shaped cluster deep in your brain that acts as your emotional alarm system — responsible for making you feel happy, scared, or excited!"
    },
    {
        system: "Brain & Senses",
        stem: "How fast can nerve signals travel in your body?",
        options: ["As fast as a walking pace","As fast as a bicycle","As fast as a racing car","At the speed of light"],
        correctHash: "9f1e60ab16dd1be26751244102a54212261469550c29290696b8f53f1b38bc63",
        rationale: "The fastest nerve signals in your body travel at up to 270 miles per hour — faster than a racing car! That's how you react so quickly when something touches you."
    },
    {
        system: "Brain & Senses",
        stem: "What covers your entire body, protects you from germs, and keeps your insides safe?",
        options: ["Muscles","Fat","Skin","Hair"],
        correctHash: "2a0070d014bc41cb1fb0e65f98a3c94e00478a2501dca02836d2d5eb3a742a62",
        rationale: "Your skin is actually the largest organ in your whole body! It's your personal waterproof armour, keeping germs out and moisture in."
    },
    {
        system: "Brain & Senses",
        stem: "When a doctor taps your knee and your leg kicks on its own, what is that called?",
        options: ["A habit","A reflex","A muscle cramp","A nerve buzz"],
        correctHash: "800a0dd4650b95707c0c7c2124860da027ee494897bcd2cf5adc1fab4d6db0a8",
        rationale: "A reflex is an automatic response your spinal cord sends out without waiting for your brain! It's your body's emergency fast-track system to protect you from harm."
    },
],
    
    highschool: [
    {
        system: "Skeletal System",
        stem: "What type of bone tissue has a spongy, lattice-like structure found inside large bones?",
        options: ["Compact bone","Cartilage","Cancellous (spongy) bone","Periosteum"],
        correctHash: "25110839a3f55416da4196fce622bd3cf46b8cdc2e52ac88826c0bd8284a9d52",
        rationale: "Cancellous (spongy) bone has a honeycomb-like structure that makes bones lightweight yet strong. The spaces within it are filled with red bone marrow that produces blood cells."
    },
    {
        system: "Skeletal System",
        stem: "What is the periosteum?",
        options: ["The inner cavity of a bone","A tough fibrous membrane covering the outer surface of bones","The cartilage at bone ends","The marrow inside bones"],
        correctHash: "f0334179f952cf75b7a1370cc28dae7c93901a853012db5cff61d5156216815b",
        rationale: "The periosteum is a dense membrane that wraps around the outside of bones. It contains blood vessels, nerves, and bone-forming cells called osteoblasts that are vital for growth and repair."
    },
    {
        system: "Skeletal System",
        stem: "Which type of joint allows rotation only, such as turning your head from side to side?",
        options: ["Ball-and-socket joint","Hinge joint","Pivot joint","Saddle joint"],
        correctHash: "4385460467a6f59ba40d8aa21775462298fcd6028cfd5d10b564476648c8a548",
        rationale: "A pivot joint allows one bone to rotate around another. The joint between the first two cervical vertebrae (atlas and axis) is a classic example, letting you shake your head 'no'."
    },
    {
        system: "Skeletal System",
        stem: "What is ossification?",
        options: ["The process of bone fracturing","The process by which cartilage is gradually replaced by bone tissue","The removal of calcium from bones","The surgical repair of broken bones"],
        correctHash: "b25572aafd357b121bfb32fc1ae80131587c64a8a9e2978554c6c15a59e3c8a9",
        rationale: "Ossification is how bones form and grow. Most of the skeleton starts as cartilage in a developing embryo, which is then slowly replaced by hard bone tissue through this process."
    },
    {
        system: "Skeletal System",
        stem: "Which cells are responsible for building and depositing new bone tissue?",
        options: ["Osteoclasts","Osteoblasts","Chondrocytes","Osteocytes"],
        correctHash: "796a1cf690830a5555e75259473c14d26d6d6a413743029642af00c30d4e4aac",
        rationale: "Osteoblasts are bone-building cells that secrete collagen and minerals to form new bone matrix. Once surrounded by matrix they become osteocytes, which maintain the existing bone."
    },
    {
        system: "Skeletal System",
        stem: "Which cells break down old bone tissue to allow continuous bone remodelling?",
        options: ["Osteoblasts","Chondrocytes","Osteoclasts","Fibroblasts"],
        correctHash: "83bf7130bdc6d798a8f13a08785d4d427d5949e71a02fce68d1d649728da6382",
        rationale: "Osteoclasts are large cells that dissolve bone mineral and matrix. They work alongside osteoblasts in a constant cycle of resorption and deposition that keeps bones healthy and responsive."
    },
    {
        system: "Skeletal System",
        stem: "Which vitamin acts like a hormone to regulate calcium absorption and is critical for bone health?",
        options: ["Vitamin A","Vitamin C","Vitamin D","Vitamin K"],
        correctHash: "3dbc82d9d2d2c49d6f6cde46333ae1cc7c0ce4b0d99812ec27c6d054a665b43a",
        rationale: "Vitamin D is converted in the body into a hormone that promotes calcium absorption from the gut and its incorporation into bone. Deficiency in children causes rickets — soft, bowed bones."
    },
    {
        system: "Skeletal System",
        stem: "The vertebral column is divided into how many named regions?",
        options: ["Three","Four","Five","Seven"],
        correctHash: "222b0bd51fcef7e65c2e62db2ed65457013bab56be6fafeb19ee11d453153c80",
        rationale: "The spine has five regions: cervical (neck, 7 vertebrae), thoracic (mid-back, 12), lumbar (lower back, 5), sacral (fused, 5), and coccygeal (tailbone, 3-5 fused bones)."
    },
    {
        system: "Skeletal System",
        stem: "What is the correct anatomical term for freely movable joints such as the knee and shoulder?",
        options: ["Synarthroses","Amphiarthroses","Diarthroses","Gomphoses"],
        correctHash: "879b31d0667fb91607fcfff05e15cc68b2fdfd126956bc5f7cb7404272eaa269",
        rationale: "Diarthroses (synovial joints) are freely movable joints lubricated by synovial fluid. Synarthroses are fixed joints like skull sutures, and amphiarthroses allow limited movement like the pubic symphysis."
    },
    {
        system: "Skeletal System",
        stem: "In adults, where is red bone marrow primarily found?",
        options: ["Inside the shaft of long bones","In flat bones and the ends of long bones","Only within the femur","Exclusively within cartilage"],
        correctHash: "78c485034cdd855e7f926181e3a636dc9de7479ecd27b3419245f5112d9cd9cb",
        rationale: "In adults, active red marrow producing blood cells is found mainly in flat bones like the sternum, pelvis, ribs, and skull, plus the epiphyses (ends) of some long bones."
    },
    {
        system: "Skeletal System",
        stem: "What tissue makes up the epiphyseal (growth) plate in developing bones?",
        options: ["Compact bone","Hyaline cartilage","Fibrocartilage","Elastic cartilage"],
        correctHash: "5d1f58203755fb6b495e82d591d13a2e423541c3dd19aa2580f53deb7707fb8d",
        rationale: "Growth plates are made of hyaline cartilage. New cartilage cells are produced on one side while cartilage on the other side is replaced by bone, causing bones to lengthen during childhood."
    },
    {
        system: "Skeletal System",
        stem: "Which vitamin deficiency causes softening and weakening of bones in children, leading to bowed legs?",
        options: ["Vitamin A","Vitamin C","Vitamin K","Vitamin D"],
        correctHash: "3dbc82d9d2d2c49d6f6cde46333ae1cc7c0ce4b0d99812ec27c6d054a665b43a",
        rationale: "Rickets is caused by Vitamin D deficiency. Without enough Vitamin D, the intestines cannot absorb sufficient calcium, so bones fail to mineralise properly and become soft and deformed."
    },
    {
        system: "Skeletal System",
        stem: "The thoracic cage is formed by the ribs, thoracic vertebrae, and which other structure?",
        options: ["Clavicle","Scapula","Sternum","Humerus"],
        correctHash: "fbb1c44b5612e7be5573b9c62566687946faf8ebd363a960ebcbdc73ee8c4ac3",
        rationale: "The sternum (breastbone) forms the front wall of the thoracic cage. The ribs attach to it at the front and to the thoracic vertebrae at the back, forming a protective barrel around the heart and lungs."
    },
    {
        system: "Skeletal System",
        stem: "What type of cartilage makes up the intervertebral discs between vertebrae?",
        options: ["Hyaline cartilage","Elastic cartilage","Fibrocartilage","Calcified cartilage"],
        correctHash: "2a3307c44aa4f7d3677602ff150beba838fa09c5402e176a5a781bae5823e91f",
        rationale: "Fibrocartilage is tough and highly resistant to compression, making it ideal for intervertebral discs that absorb the enormous forces placed on the spine during daily movement."
    },
    {
        system: "Skeletal System",
        stem: "How many pairs of ribs does the human body have in total?",
        options: ["10 pairs","11 pairs","12 pairs","14 pairs"],
        correctHash: "60a897dfc3165dfd7a529e427fd2227a914118b6446994c76b1f81e888eb0eac",
        rationale: "Humans have 12 pairs of ribs. The top 7 pairs are 'true ribs' attached directly to the sternum. Pairs 8-10 are 'false ribs' and pairs 11-12 are 'floating ribs' with no front attachment."
    },
    {
        system: "Muscular System",
        stem: "What is the basic functional contractile unit of a skeletal muscle fibre?",
        options: ["Myofibril","Sarcomere","Actin filament","Motor unit"],
        correctHash: "b4b3b0d8aac7e0fd1802a1bfe062c70abcdda40f61e20f36f194c733bcdd8c41",
        rationale: "The sarcomere is the fundamental unit of muscle contraction. It runs from one Z-line to the next and contains overlapping thick (myosin) and thin (actin) filaments that slide past each other during contraction."
    },
    {
        system: "Muscular System",
        stem: "According to the sliding filament theory, which two proteins interact to produce muscle contraction?",
        options: ["Collagen and elastin","Myosin and actin","Keratin and fibrin","Tropomyosin and titin"],
        correctHash: "a2f5bf4482d2e79af0b5fd9b3063a134b1c0cb80f88083a9ca0ee83f481d4dc9",
        rationale: "Myosin heads (thick filaments) repeatedly attach to actin (thin filaments), pivot, and pull them inward. This shortens the sarcomere and creates the pulling force of muscle contraction."
    },
    {
        system: "Muscular System",
        stem: "Which ion is released from the sarcoplasmic reticulum to trigger muscle contraction?",
        options: ["Sodium (Na+)","Potassium (K+)","Calcium (Ca2+)","Magnesium (Mg2+)"],
        correctHash: "41a00281b569244c91942abb76c70db06d521c1380f24400a7b5e7c7666bad29",
        rationale: "When a nerve impulse arrives, calcium floods out of the sarcoplasmic reticulum. It binds to troponin on the actin filament, which moves tropomyosin aside and exposes binding sites for myosin heads."
    },
    {
        system: "Muscular System",
        stem: "What is a motor unit?",
        options: ["A single muscle fibre","A motor neuron and all the muscle fibres it controls","The sarcomere within a myofibril","The neuromuscular junction alone"],
        correctHash: "21f69fb422a77f10250cf80943cfe3363f0f20643e35a602da5fb27b7116bb61",
        rationale: "When one motor neuron fires, all the muscle fibres it connects to contract simultaneously — this is the motor unit. Precise movements use small motor units; powerful movements recruit large ones."
    },
    {
        system: "Muscular System",
        stem: "What primarily causes muscle fatigue during intense exercise?",
        options: ["Complete oxygen depletion in the blood","Depletion of ATP and accumulation of metabolic byproducts","Muscle fibres dying permanently","Tendons stretching beyond their limit"],
        correctHash: "162af265160c59a65be460147f9d5ff587e8f7e7f1fd368ea3f89273269625c6",
        rationale: "Fatigue results from reduced ATP availability, accumulation of inorganic phosphate, hydrogen ions (lowering pH), and other metabolic waste products that interfere with the contractile mechanism."
    },
    {
        system: "Muscular System",
        stem: "Which type of contraction occurs when a muscle generates tension but does not change in length?",
        options: ["Isotonic concentric","Isotonic eccentric","Isometric","Isokinetic"],
        correctHash: "0cbad796a9eb498b21b0a2699112dc15656da0d6cce5eeb4a932ccef0ae25f8c",
        rationale: "An isometric contraction produces force without joint movement — like pushing against a wall. Isotonic contractions involve movement: concentric shortens the muscle, eccentric lengthens it under load."
    },
    {
        system: "Muscular System",
        stem: "What is the neuromuscular junction?",
        options: ["The point where two muscles attach to each other","The site where a motor neuron communicates with a muscle fibre","The tendon insertion point on bone","The Z-line boundary of a sarcomere"],
        correctHash: "d98ac5885909780e4a244f2edbcf6f5df10ad766c1b74288fbccbe29fa6be951",
        rationale: "The neuromuscular junction is a specialised synapse between a motor neuron terminal and a muscle fibre. Neurotransmitters released here trigger the electrical signal that starts contraction."
    },
    {
        system: "Muscular System",
        stem: "Which neurotransmitter is released at the neuromuscular junction to initiate muscle contraction?",
        options: ["Dopamine","Serotonin","Acetylcholine","Norepinephrine"],
        correctHash: "22adacfb36d565219587af0669013b1aac83d988c099714736aab47fdfbec66f",
        rationale: "Acetylcholine (ACh) is released from the motor neuron terminal into the synaptic cleft. It binds to receptors on the muscle membrane, generating an action potential that triggers contraction."
    },
    {
        system: "Muscular System",
        stem: "What is DOMS (Delayed Onset Muscle Soreness)?",
        options: ["A chronic muscle wasting disease","Pain and stiffness felt 24-72 hours after unfamiliar exercise due to microscopic muscle damage and inflammation","Immediate cramping experienced during peak exercise","Permanent muscle inflammation requiring medical treatment"],
        correctHash: "85f495fc5d947f1dc4cef7807997ae8c87c866b02a0df54b5bad8534cd525e3c",
        rationale: "DOMS is caused by microscopic tears in muscle fibres and connective tissue following eccentric exercise or unaccustomed training. The resulting inflammation and repair process causes the familiar ache."
    },
    {
        system: "Muscular System",
        stem: "Slow-twitch (Type I) muscle fibres are best suited for which type of activity?",
        options: ["Explosive short-distance sprinting","Heavy one-rep maximum weightlifting","Long-duration endurance activities like marathon running","Quick reflex-based actions"],
        correctHash: "a63d86fea14cad730e7870c7e2f2770da952f453bc49d2ab46092bfc4e876c57",
        rationale: "Type I fibres are rich in mitochondria and myoglobin, have excellent blood supply, and are highly fatigue-resistant. They rely on aerobic metabolism, making them perfect for sustained endurance activities."
    },
    {
        system: "Muscular System",
        stem: "Fast-twitch (Type II) muscle fibres are primarily characterised by which feature?",
        options: ["High endurance and extreme fatigue resistance","Slow contraction speed suitable for posture","High myoglobin content giving them a red colour","Rapid, powerful contractions with relatively quick fatigability"],
        correctHash: "e23ca2073966ee6891323053ff02c84e85619c382cd7f67ba4550593d48f9ec0",
        rationale: "Type II fibres contract quickly and powerfully using anaerobic glycolysis for rapid ATP production. However, they fatigue quickly because they generate lactic acid and have fewer mitochondria."
    },
    {
        system: "Muscular System",
        stem: "What is the 'origin' of a skeletal muscle?",
        options: ["The attachment point on the bone that moves","The stationary attachment point on the fixed bone","Where a muscle belly splits into two heads","The point where muscle tissue transitions into tendon"],
        correctHash: "52c16646d909edf9c4046215b918175d70f75dee0db173661bc0e0e3fd9575aa",
        rationale: "The origin is where a muscle attaches to the relatively fixed bone. The insertion is on the bone that moves. When the muscle contracts, the insertion moves toward the origin."
    },
    {
        system: "Muscular System",
        stem: "What is muscular hypertrophy?",
        options: ["Muscle wasting due to prolonged inactivity","An increase in the cross-sectional size of individual muscle fibres from resistance training","The development of entirely new muscle fibres","Chronic muscle inflammation following injury"],
        correctHash: "188d7315a50d22bbe0689892f5d5a7d14c05d891e35ba1ab29bd67d23621a9ae",
        rationale: "Hypertrophy is an increase in muscle fibre diameter. Resistance training causes micro-damage, and repair adds more myofibrils and contractile protein, making each fibre thicker and the whole muscle larger."
    },
    {
        system: "Muscular System",
        stem: "Which energy system provides immediate fuel for the first few seconds of maximal explosive effort?",
        options: ["Aerobic oxidative system","Anaerobic glycolytic system","Phosphocreatine (ATP-PC) system","Fat oxidation system"],
        correctHash: "2781ee366e0b71b531ae19c92b9b9200ef07f8d679ca70f79eaf451a58c5e416",
        rationale: "The ATP-PC system uses stored ATP and phosphocreatine to regenerate ATP almost instantly. It powers maximum efforts like jumping or sprinting for roughly 8-10 seconds before other systems must take over."
    },
    {
        system: "Muscular System",
        stem: "What is the primary role of the sarcoplasmic reticulum in muscle cells?",
        options: ["To produce ATP needed for contraction","To store and release calcium ions that initiate contraction","To synthesise structural muscle proteins","To conduct the electrical action potential along the fibre"],
        correctHash: "5f0860a48325535a29d9cba32ac92dca273f9dacf47239f67bdfcc9d87765b85",
        rationale: "The sarcoplasmic reticulum is a specialised endoplasmic reticulum that wraps around myofibrils. It stores calcium at rest and releases it upon stimulation, which is the trigger for the contraction cycle."
    },
    {
        system: "Heart & Lungs",
        stem: "What is cardiac output?",
        options: ["The pressure of blood within the arteries","The volume of blood the heart pumps out per minute","The rate of oxygen exchange across alveoli","The electrical activity pattern of the heart"],
        correctHash: "08e3a8b0b8f67461a41ff0d807487389f2fc807e426589e65a74c23907d72f14",
        rationale: "Cardiac output = heart rate × stroke volume. At rest it is about 5 litres per minute. During intense exercise it can rise to 20-25 litres per minute in trained athletes."
    },
    {
        system: "Heart & Lungs",
        stem: "What is the sinoatrial (SA) node?",
        options: ["A valve preventing backflow between the atria and ventricles","The heart's natural pacemaker that initiates each electrical heartbeat","A blood vessel that supplies the heart muscle with oxygen","The outermost protective layer of the heart wall"],
        correctHash: "7c21685058c3834d771305cfbd0d96ab0c90bf629f7ebd8b9d2206f2af3b5388",
        rationale: "The SA node is a cluster of specialised cells in the right atrium that spontaneously generates electrical impulses about 60-100 times per minute, setting the heart's natural rhythm."
    },
    {
        system: "Heart & Lungs",
        stem: "Which blood vessels supply the heart muscle itself with oxygenated blood?",
        options: ["Pulmonary arteries","Aortic arch branches","Coronary arteries","Jugular veins"],
        correctHash: "9ca769fed3cfd8930ae66c49b28ff59ef24287adb3d2159350b5777f576df1e9",
        rationale: "The coronary arteries branch from the base of the aorta and supply the heart muscle (myocardium). Blockage of these arteries causes a heart attack (myocardial infarction)."
    },
    {
        system: "Heart & Lungs",
        stem: "What does systolic blood pressure measure?",
        options: ["The arterial pressure when the heart muscle is relaxed","The mathematical average of systolic and diastolic pressures","The arterial pressure generated when the heart contracts and ejects blood","The pressure within the pulmonary circulation"],
        correctHash: "7576790412b4f8e6a1cd7aa4fc6c20c52a2e9a0cf53451857ed65515acb0d54c",
        rationale: "Systolic pressure is the peak arterial pressure reached during ventricular contraction. Diastolic is the lower pressure during relaxation. A normal reading is around 120/80 mmHg."
    },
    {
        system: "Heart & Lungs",
        stem: "What is the function of the bicuspid (mitral) valve?",
        options: ["Prevents backflow from the aorta into the left ventricle","Prevents backflow from the left ventricle into the left atrium","Prevents backflow from the pulmonary artery into the right ventricle","Prevents backflow from the right ventricle into the right atrium"],
        correctHash: "cbdda951c8812406fe56619dc8b9c3a1f4856ef56a7a2e12b870cefa28391e80",
        rationale: "The bicuspid (mitral) valve sits between the left atrium and left ventricle. It snaps shut when the ventricle contracts, preventing oxygenated blood from flowing backwards toward the lungs."
    },
    {
        system: "Heart & Lungs",
        stem: "During gas exchange in the alveoli, oxygen moves from air into the blood by which process?",
        options: ["Active transport requiring ATP","Osmosis driven by water pressure","Diffusion down a concentration gradient","Filtration driven by blood pressure"],
        correctHash: "c773eedafb39e69ebc5846487a3b8b442b6851c4ef08b0de498b7c784c217218",
        rationale: "Oxygen diffuses passively from areas of high concentration in the alveolar air into the surrounding capillary blood where concentration is lower. No energy is required — it follows its own gradient."
    },
    {
        system: "Heart & Lungs",
        stem: "What is tidal volume?",
        options: ["The maximum total capacity of both lungs combined","The volume of air remaining after a maximum forced exhalation","The volume of air inhaled or exhaled during one normal resting breath","The maximum volume of air forcefully exhaled after a deep breath"],
        correctHash: "f27cfa279203c9b8df1c0c7a00bc6ca19f40d2baf434bdec52003edba0bd7274",
        rationale: "Tidal volume at rest is approximately 500 mL per breath. It increases significantly during exercise as the body demands more oxygen and needs to expel more carbon dioxide."
    },
    {
        system: "Heart & Lungs",
        stem: "What is the role of pulmonary surfactant?",
        options: ["To kill bacteria that enter the airways","To transport oxygen molecules within alveolar fluid","To reduce surface tension inside alveoli, preventing them from collapsing","To warm and humidify air entering the lungs"],
        correctHash: "7120b2e505a216718ca52018f1a0321bc3b98ffc1ac5fa70cf48fb7e71abe2c6",
        rationale: "Surfactant is produced by Type II alveolar cells. Without it, the surface tension of the water lining alveoli would cause them to collapse with each exhalation — a condition seen in premature infants."
    },
    {
        system: "Heart & Lungs",
        stem: "Adult haemoglobin is made up of how many polypeptide chains?",
        options: ["Two","Three","Four","Six"],
        correctHash: "04efaf080f5a3e74e1c29d1ca6a48569382cbbcd324e8d59d2b83ef21c039f00",
        rationale: "Adult haemoglobin (HbA) consists of four polypeptide chains — two alpha and two beta. Each chain carries one haem group containing an iron atom that can bind one oxygen molecule, giving four O2 per haemoglobin."
    },
    {
        system: "Heart & Lungs",
        stem: "What is the Bohr effect?",
        options: ["The increase in heart rate in response to aerobic exercise","The rightward shift of the oxygen-haemoglobin dissociation curve caused by increased CO2 and lower pH","The age-related decline in lung capacity","The reflex control of breathing rate by CO2 chemoreceptors"],
        correctHash: "404e119270558481c08f91c898690f50fef2a6d0b7c3f5341dbb8634bec71329",
        rationale: "The Bohr effect means haemoglobin releases oxygen more readily in tissues with high CO2 and low pH (like active muscles). This perfectly matches oxygen delivery to where it is needed most."
    },
    {
        system: "Heart & Lungs",
        stem: "Which brain region contains the respiratory centres that automatically control breathing rhythm?",
        options: ["Cerebral cortex","Cerebellum","Medulla oblongata","Hypothalamus"],
        correctHash: "15cd8eea6310b11bdd2d0218d7fa027cd682fb789127c420038b5ccdfb037157",
        rationale: "The medulla oblongata houses the dorsal and ventral respiratory groups that set the basic breathing rhythm. The pons fine-tunes it. CO2 levels in the blood are the primary driver of breathing rate."
    },
    {
        system: "Heart & Lungs",
        stem: "What is a normal resting heart rate range for a healthy adult?",
        options: ["40-50 bpm","60-100 bpm","100-120 bpm","120-140 bpm"],
        correctHash: "205d5224ffe1e35571ac629e350e67d9fa65ef6297a2d6448c73ddc569c42625",
        rationale: "60-100 beats per minute is the normal resting range. Highly trained endurance athletes often have resting rates of 40-50 bpm because their stronger hearts pump more blood per beat."
    },
    {
        system: "Heart & Lungs",
        stem: "What is erythropoiesis?",
        options: ["The destruction and recycling of old red blood cells","The production of new red blood cells in the bone marrow","The clotting cascade at a wound site","The binding of oxygen to haemoglobin in the lungs"],
        correctHash: "92bd6c90afe4619f35911574ded2c6864f3dcdb63cadba2517adbbce4d332530",
        rationale: "Erythropoiesis occurs mainly in red bone marrow and is stimulated by the hormone erythropoietin (EPO) released by the kidneys when blood oxygen levels fall — for example at high altitude."
    },
    {
        system: "Heart & Lungs",
        stem: "What structure separates the left and right sides of the heart?",
        options: ["The pericardium","The pleura","The septum","The myocardium"],
        correctHash: "a1d2b8f49a6b1828c21610e13171c644b8d21435e4294d995b586a318106f33f",
        rationale: "The septum is a thick muscular wall dividing the heart into right and left halves. This separation ensures oxygenated and deoxygenated blood never mix during normal circulation."
    },
    {
        system: "Heart & Lungs",
        stem: "What is the name of the large vein that returns deoxygenated blood from the lower body to the right atrium?",
        options: ["Superior vena cava","Pulmonary vein","Inferior vena cava","Coronary sinus"],
        correctHash: "7c34e4565416fe36c5f23faf583082721ff50171fd63c4dec4af3367a45a4591",
        rationale: "The inferior vena cava drains blood from the lower body, while the superior vena cava drains the upper body and head. Both empty into the right atrium. Pulmonary veins, unusually, carry oxygenated blood."
    },
    {
        system: "Digestion",
        stem: "What is the chemical name for the acid produced by the stomach?",
        options: ["Sulfuric acid","Hydrochloric acid","Citric acid","Carbonic acid"],
        correctHash: "65705c713c03dc24dfea0af48a7232af4d4441d30bcc209d5975cf1c03f6ca1f",
        rationale: "Gastric glands secrete hydrochloric acid (HCl), creating a stomach pH of 1.5-3.5. This denatures proteins, activates pepsinogen into pepsin, and kills most ingested bacteria."
    },
    {
        system: "Digestion",
        stem: "Which enzyme found in saliva begins the chemical digestion of carbohydrates in the mouth?",
        options: ["Pepsin","Lipase","Salivary amylase","Trypsin"],
        correctHash: "93504366e5610a94c1d4a5f45e81fe9ea4846a90a6f104d7638be1cfdd624b23",
        rationale: "Salivary amylase begins breaking starch (polysaccharides) into smaller maltose units in the mouth. This is why starchy food like bread tastes slightly sweet if you chew it for a long time."
    },
    {
        system: "Digestion",
        stem: "Which specialised cells in the stomach lining secrete hydrochloric acid?",
        options: ["Chief cells","Parietal cells","Goblet cells","G cells"],
        correctHash: "6ca454a7857d099a85b34fef0dc837384c184e9e9949e9a8af746236e79653d9",
        rationale: "Parietal cells (oxyntic cells) in the gastric glands secrete both HCl and intrinsic factor. Chief cells secrete pepsinogen, and G cells produce the hormone gastrin which stimulates acid secretion."
    },
    {
        system: "Digestion",
        stem: "What is the primary role of pepsin in digestion?",
        options: ["Breaks down carbohydrates in the stomach","Breaks down proteins into smaller peptide fragments in the stomach","Emulsifies fat droplets in the small intestine","Neutralises stomach acid as it enters the duodenum"],
        correctHash: "6b3b44f6ed214179063ec35cad471bac96e9a8d6fb5cded7faf301bd1f3e04af",
        rationale: "Pepsin is a protease enzyme active in the acidic environment of the stomach. It is secreted as inactive pepsinogen by chief cells and activated by HCl, preventing it from digesting the stomach itself."
    },
    {
        system: "Digestion",
        stem: "What is enterohepatic circulation?",
        options: ["Portal blood flow from intestines to the liver","The recycling of bile salts between the liver, bile ducts, small intestine, and back to the liver","The arterial blood supply to the entire GI tract","The nerve supply from the enteric nervous system to the intestines"],
        correctHash: "a00bf975f0218135234d4f62004243dece16c6d7abe9f8f32e635a428a2f5eb2",
        rationale: "About 95% of bile salts secreted into the small intestine are reabsorbed in the terminal ileum and returned to the liver for reuse. This highly efficient recycling means the body needs to synthesise little new bile."
    },
    {
        system: "Digestion",
        stem: "Which hormone triggers the gallbladder to contract and release bile into the small intestine?",
        options: ["Gastrin","Secretin","Cholecystokinin (CCK)","Insulin"],
        correctHash: "9a8e9a4da40af58f311109861e9d688d08827dc09d78759a9846192c82e48034",
        rationale: "CCK is released by cells in the duodenal wall in response to fat and protein. It stimulates gallbladder contraction, relaxes the sphincter of Oddi, and also triggers pancreatic enzyme secretion."
    },
    {
        system: "Digestion",
        stem: "What is the brush border of the small intestine?",
        options: ["A protective mucus layer coating the intestinal wall","Densely packed microvilli on enterocyte surfaces that enormously increase the absorptive surface area","The smooth muscle layer responsible for peristaltic contractions","A layer of mucus-secreting goblet cells lining the intestinal wall"],
        correctHash: "469edf1c21da912961a97d002ed293c21b93207d6774f1852fd9669ac539958e",
        rationale: "Each epithelial cell (enterocyte) has around 3,000 microvilli on its apical surface forming the brush border. This increases the total absorptive surface of the small intestine to approximately the size of a tennis court."
    },
    {
        system: "Digestion",
        stem: "Where are fat-soluble vitamins (A, D, E, K) primarily absorbed in the digestive tract?",
        options: ["In the stomach with gastric acid","In the large intestine by bacterial action","In the small intestine with the aid of bile salts and micelles","In the mouth through the buccal mucosa"],
        correctHash: "12894cbce36980c4a15b572623b3619a9d5103cbbea7f931af65508bfbb84258",
        rationale: "Fat-soluble vitamins are packaged into micelles (tiny fat-bile complexes) in the small intestine and absorbed through the intestinal wall into lymphatic vessels (lacteals) rather than directly into blood."
    },
    {
        system: "Digestion",
        stem: "What is the function of the ileocecal valve?",
        options: ["Controls the rate of chyme release from the stomach into the duodenum","Prevents backflow of large intestine contents into the small intestine","Regulates the release of bile into the duodenum","Separates the jejunum from the ileum"],
        correctHash: "7f0d57ac31412c820bcf9cbc71351d0fbda6f323aac58c789feeb6720fd91e56",
        rationale: "The ileocecal valve sits at the junction of the small and large intestines. It acts as a one-way gate preventing bacteria-rich colonic contents from contaminating the small intestine."
    },
    {
        system: "Digestion",
        stem: "Which macronutrient begins chemical digestion first — in the mouth?",
        options: ["Proteins","Fats","Carbohydrates","Vitamins and minerals"],
        correctHash: "f267c105ad956a674038367beb825e4ef925ece2ea91720e43532768a6ce392e",
        rationale: "Salivary amylase immediately begins breaking down starch molecules as soon as food enters the mouth. Protein digestion starts in the stomach, and fat digestion mainly occurs in the small intestine."
    },
    {
        system: "Digestion",
        stem: "What is the hepatic portal system?",
        options: ["The bile duct network draining from liver to intestine","The network of veins carrying nutrient-rich blood from the intestines directly to the liver for processing","The arterial supply bringing oxygenated blood to the liver","The lymphatic vessels draining absorbed fats from the gut"],
        correctHash: "e56b360efe970280115c2498dfe9b03586c0995dc69f7a73666078f3c8953580",
        rationale: "After absorption, nutrients pass into the hepatic portal vein and travel to the liver first. The liver can store, transform, detoxify, or redistribute them before they reach general circulation."
    },
    {
        system: "Digestion",
        stem: "What causes acid reflux (heartburn)?",
        options: ["Excess bile flooding back into the stomach","Gastric acid rising into the oesophagus due to a weakened lower oesophageal sphincter","Spasm of the pyloric sphincter trapping acid","Bacterial infection of the stomach lining"],
        correctHash: "9435f30194a44100c7e3f387a4f93383a749af2a16402614b70e1a979abbf02d",
        rationale: "The lower oesophageal sphincter normally prevents stomach contents from rising. When it is weak or relaxes inappropriately, acidic chyme enters the oesophagus, causing the burning sensation of heartburn."
    },
    {
        system: "Digestion",
        stem: "What is the primary site of dietary iron absorption in the gastrointestinal tract?",
        options: ["Stomach","Duodenum and upper jejunum","Ileum","Large intestine"],
        correctHash: "12cbc27ef4bb099b1eff845a9512e15d9e32a242feb768f3607736612abc985d",
        rationale: "Iron is mainly absorbed in the duodenum and proximal jejunum. Vitamin C enhances absorption by keeping iron in its more absorbable ferrous (Fe2+) form. Deficiency causes iron-deficiency anaemia."
    },
    {
        system: "Digestion",
        stem: "Which intestinal cells are primarily responsible for absorbing digested nutrients?",
        options: ["Goblet cells","Enterocytes","Paneth cells","Enteroendocrine cells"],
        correctHash: "b7bfb1d820c47e8b6a1f5bb646c1be1ffd35705669d9e1daf6f07346f148c0ee",
        rationale: "Enterocytes are the absorptive epithelial cells lining the small intestinal villi. They transport amino acids, monosaccharides, fatty acids, vitamins, and minerals into blood or lymph."
    },
    {
        system: "Digestion",
        stem: "What is the role of intrinsic factor, produced by parietal cells of the stomach?",
        options: ["It converts pepsinogen into active pepsin","It neutralises acid as it enters the duodenum","It is essential for the absorption of vitamin B12 in the terminal ileum","It stimulates bile production in the liver"],
        correctHash: "adae95815ee39a20c4093e49edd68436f4420cfd8f061c803154ca8dd8577da6",
        rationale: "Intrinsic factor is a glycoprotein that binds vitamin B12 (cobalamin) in the stomach and escorts it to the terminal ileum where it can be absorbed. Without intrinsic factor, B12 deficiency and pernicious anaemia result."
    },
    {
        system: "Brain & Senses",
        stem: "What are the three protective membranes that enclose the brain and spinal cord collectively called?",
        options: ["Pleura","Peritoneum","Meninges","Pericardium"],
        correctHash: "70dbe55f1ab155da1cb1363cd52105b3ccf815c7fe6362fcaaf7484a936398a8",
        rationale: "The three meningeal layers from outside to inside are: dura mater (tough), arachnoid mater (web-like), and pia mater (thin, directly touching the brain). Meningitis is inflammation of these membranes."
    },
    {
        system: "Brain & Senses",
        stem: "What is the primary function of the myelin sheath surrounding nerve axons?",
        options: ["To supply glucose and nutrients directly to the nerve cell body","To link adjacent neurons across synaptic gaps","To electrically insulate the axon and dramatically speed up nerve impulse conduction","To produce and store neurotransmitters for release"],
        correctHash: "cfaa60016bd44e63832d26ec194302f6d518393c57968d80172b59f594e79da9",
        rationale: "Myelin allows saltatory conduction — the impulse leaps between gaps in myelin (nodes of Ranvier) rather than travelling continuously. This increases conduction speed from about 1 m/s to up to 120 m/s."
    },
    {
        system: "Brain & Senses",
        stem: "What is the typical resting membrane potential of a neuron?",
        options: ["+70 mV","0 mV","-70 mV","-140 mV"],
        correctHash: "5301e9b94bfb6f3d28b1445c519729af2c073e9105d3db904b4a17ec24185f6a",
        rationale: "At rest, the inside of a neuron is about -70 mV relative to the outside, maintained by the sodium-potassium pump. Depolarisation to threshold (-55 mV) triggers an action potential."
    },
    {
        system: "Brain & Senses",
        stem: "What occurs during a nerve action potential?",
        options: ["Calcium ions flow into the cell triggering neurotransmitter release at the dendrites","Sodium ions rapidly enter the cell causing depolarisation, followed by potassium exiting to repolarise the membrane","Dopamine is released into the synapse causing the next neuron to fire","The myelin sheath contracts to physically squeeze the signal along"],
        correctHash: "9bd129a30e20a6d07df7a3c71da41da49d5baecb5e9455ddd35a919aebebad8d",
        rationale: "An action potential is an all-or-nothing electrical event. Voltage-gated Na+ channels open (depolarisation), then K+ channels open (repolarisation), briefly overshooting to hyperpolarisation before returning to rest."
    },
    {
        system: "Brain & Senses",
        stem: "Which cerebral lobe is primarily responsible for processing touch sensation and spatial awareness?",
        options: ["Frontal lobe","Occipital lobe","Temporal lobe","Parietal lobe"],
        correctHash: "4f6842c283c78645d7981050717da713412420400290badbba38ed24871ab47a",
        rationale: "The parietal lobe contains the primary somatosensory cortex which maps touch, temperature, and pain from the body. It also integrates spatial information to help you know where your body parts are."
    },
    {
        system: "Brain & Senses",
        stem: "What is the primary role of the hypothalamus?",
        options: ["Direct voluntary control of skeletal muscle movement","Processing and relaying visual information to the cortex","Regulating homeostasis including body temperature, hunger, thirst, and circadian rhythms","Forming and consolidating long-term explicit memories"],
        correctHash: "e6318cb46b70b3e86b066a0f954b4fb38a9875226170671421fdd010b5bbd298",
        rationale: "The hypothalamus is the master regulator of homeostasis. It controls the autonomic nervous system and pituitary gland, coordinating responses to temperature, hydration, hunger, stress, and sleep cycles."
    },
    {
        system: "Brain & Senses",
        stem: "What is the corpus callosum?",
        options: ["The folded outer layer of the cerebral hemispheres","A massive band of white matter fibres connecting the left and right cerebral hemispheres","The floor of the third and fourth brain ventricles","The fibrous periosteum covering the exterior of the skull"],
        correctHash: "eacff139efe0e33f718dc84777ef98f60957278b3c5c0608f43df23913f24a67",
        rationale: "The corpus callosum is the largest white matter structure in the brain, containing about 200-250 million nerve fibres. It allows rapid communication and coordination between the two cerebral hemispheres."
    },
    {
        system: "Brain & Senses",
        stem: "Which neurotransmitter is most associated with the brain's reward, motivation, and pleasure circuits?",
        options: ["Acetylcholine","Serotonin","Dopamine","GABA"],
        correctHash: "96cae9d2238bef8e6a5ffbcc25fe73f0c222fee03171fbb0b55fa3d0816130ce",
        rationale: "Dopamine is released in the mesolimbic pathway (reward circuit) in response to rewarding stimuli. Disruption of dopamine signalling is implicated in addiction, Parkinson's disease, and schizophrenia."
    },
    {
        system: "Brain & Senses",
        stem: "What is the blood-brain barrier?",
        options: ["The dura mater layer that mechanically shields the brain","A highly selective barrier formed by specialised capillary endothelial cells that tightly regulates what enters the brain","The cerebrospinal fluid cushion surrounding brain tissue","The bony cranium protecting the brain from physical trauma"],
        correctHash: "e7b217a9881a8ed5a7bd678b014cad771e5f182fa8b841a9ee42ef486e541782",
        rationale: "The blood-brain barrier consists of tightly joined endothelial cells with no gaps. It permits oxygen, glucose, and some drugs to pass while blocking toxins, pathogens, and most large molecules from reaching neural tissue."
    },
    {
        system: "Brain & Senses",
        stem: "Which photoreceptor cells in the retina are specialised for detecting dim light and enabling night vision?",
        options: ["Cone cells","Rod cells","Ganglion cells","Bipolar cells"],
        correctHash: "3342b317ec2732cc40b636e5d8b91a4016e5e348ae7e8142b82d964325a2a7c9",
        rationale: "Rods are extremely light-sensitive and contain rhodopsin. There are about 120 million rods concentrated in the peripheral retina. They only detect light intensity, not colour, which is why night vision is greyscale."
    },
    {
        system: "Brain & Senses",
        stem: "What is the function of the semicircular canals in the inner ear?",
        options: ["Converting sound vibrations into nerve impulses for hearing","Detecting rotational head movements to help maintain balance and spatial orientation","Amplifying sound waves before they reach the cochlea","Equalising air pressure between the inner and outer ear"],
        correctHash: "81b09df2835ede424feb623781630ced179346556155659d7f73e510c010f878",
        rationale: "The three semicircular canals are arranged in perpendicular planes to detect rotation in any direction. Fluid movement within them bends hair cells, signalling rotational acceleration to the brain."
    },
    {
        system: "Brain & Senses",
        stem: "Which structure converts mechanical sound vibrations into electrical nerve impulses sent to the brain?",
        options: ["Semicircular canals","Eardrum (tympanic membrane)","Cochlea","Ossicles (tiny ear bones)"],
        correctHash: "0cf2f68837a3c7cfbf702b538d5a34cbb4ae772082760d27bf5880e021189e72",
        rationale: "The cochlea is a fluid-filled, snail-shaped structure lined with thousands of hair cells that respond to different sound frequencies. Bending of these hairs generates electrical signals sent via the auditory nerve."
    },
    {
        system: "Brain & Senses",
        stem: "What does the autonomic nervous system primarily regulate?",
        options: ["Voluntary control of all skeletal muscles","Conscious sensory processing in the cerebral cortex","Involuntary body functions such as heart rate, digestion, glandular secretion, and smooth muscle activity","Fine motor coordination and balance through the cerebellum"],
        correctHash: "522cb09337ff215dec3f781977b73c2a5b657c24bcdb88c79710b0ab9d509a76",
        rationale: "The autonomic nervous system has two divisions: sympathetic (fight-or-flight) and parasympathetic (rest-and-digest). They act in opposition to regulate heart rate, breathing, digestion, and blood pressure automatically."
    },
    {
        system: "Brain & Senses",
        stem: "Which neurotransmitter is the brain's primary inhibitory signal, acting as a neural 'brake' to calm activity?",
        options: ["Glutamate","Acetylcholine","Norepinephrine","GABA (gamma-aminobutyric acid)"],
        correctHash: "8ec3099262069e1163700475c8dfd3efbf0893c39258258d774b7c6fd8ae627f",
        rationale: "GABA is the main inhibitory neurotransmitter in the brain. It hyperpolarises neurons, making them less likely to fire. Many anxiolytic drugs like benzodiazepines work by enhancing GABA's inhibitory effects."
    },
    {
        system: "Brain & Senses",
        stem: "What is neuroplasticity?",
        options: ["The physical elasticity and flexibility of brain tissue itself","The brain's ability to reorganise and form new neural connections in response to learning, experience, or injury throughout life","The protective myelin coating that insulates neuron axons","The natural process of neuronal cell death that accelerates with ageing"],
        correctHash: "67091fecc4158f27f498667f900a6d5bc25448d2f437eda4e1c8d4663065ff79",
        rationale: "Neuroplasticity underlies all learning and memory. When you practise a skill, synaptic connections strengthen (long-term potentiation). After brain injury, plasticity allows other regions to partially compensate for lost function."
    },
],
    advanced: [
    {
        system: "Skeletal System",
        stem: "Which signalling pathway primarily regulates osteoblast differentiation from mesenchymal stem cells?",
        options: ["Wnt/β-catenin signalling pathway","JAK-STAT signalling pathway","cAMP-PKA signalling pathway","Hedgehog signalling pathway"],
        correctHash: "c72f4efbc9c12fd481955e4f1871d6550e497bed0e29592bd8edfa128f0f2541",
        rationale: "The Wnt/β-catenin pathway is a master regulator of osteoblastogenesis. When Wnt ligands bind their receptors, β-catenin accumulates and translocates to the nucleus to activate osteoblast-specific transcription factors like Runx2."
    },
    {
        system: "Skeletal System",
        stem: "What is RANKL and what role does it play in bone remodelling?",
        options: ["A calcium-binding protein secreted by osteoblasts that inhibits osteoclast formation","A cytokine produced by osteoblasts and stromal cells that binds RANK on osteoclast precursors to stimulate osteoclastogenesis","A hormone secreted by the parathyroid gland that activates bone-forming osteoblasts","An enzyme secreted by osteoclasts that directly dissolves hydroxyapatite crystals in bone matrix"],
        correctHash: "dcee586a4f157c370e792238f7f538257395e7571aa874b75c9653e7234d63d5",
        rationale: "RANKL (Receptor Activator of Nuclear factor Kappa-B Ligand) is expressed on osteoblasts and stromal cells. It binds RANK on osteoclast precursors, promoting their differentiation and activation. Osteoprotegerin (OPG) acts as a decoy receptor, competitively inhibiting RANKL and thus suppressing bone resorption."
    },
    {
        system: "Skeletal System",
        stem: "Parathyroid hormone (PTH) has paradoxical effects on bone depending on administration pattern. What is the explanation for this?",
        options: ["Continuous PTH exposure activates osteoblasts while intermittent exposure activates osteoclasts exclusively","Intermittent PTH preferentially stimulates osteoblast activity and bone formation, while continuous elevated PTH drives osteoclast-mediated bone resorption via RANKL upregulation","PTH directly deposits calcium into bone matrix in pulses but leaches it continuously","The paradox is explained entirely by PTH receptor desensitisation regardless of exposure pattern"],
        correctHash: "db6a7e514895a0fced695597896c12d4a44a2edb7f3a1400427784f0121e1a20",
        rationale: "This PTH paradox has major clinical relevance: intermittent subcutaneous teriparatide (PTH 1-34) is used anabolically to treat severe osteoporosis, while chronically elevated endogenous PTH (hyperparathyroidism) causes bone loss through sustained osteoclast stimulation."
    },
    {
        system: "Skeletal System",
        stem: "What is the composition of the organic matrix of bone, and which protein predominates?",
        options: ["Primarily elastin (90%) with collagen type II and proteoglycans making up the remainder","Approximately 90% type I collagen with the remainder being non-collagenous proteins such as osteocalcin, osteopontin, and bone sialoprotein","Equal proportions of collagen types I, II, and III with hydroxyapatite crystals embedded throughout","Primarily fibronectin and laminin providing a scaffold for subsequent mineralisation"],
        correctHash: "fb6af1783e1bb2d28a4f4e5fa1f378c6b47caf95725d5dd233977de2733b079d",
        rationale: "Type I collagen fibres provide the tensile scaffold of bone. Non-collagenous proteins like osteocalcin (a marker of bone formation) regulate mineralisation. Hydroxyapatite [Ca10(PO4)6(OH)2] crystals embed in this organic matrix to provide compressive strength."
    },
    {
        system: "Skeletal System",
        stem: "In the context of fracture healing, what distinguishes primary (direct) bone healing from secondary (indirect) bone healing?",
        options: ["Primary healing involves callus formation and is seen in stable fractures with small gaps; secondary healing requires rigid fixation with no gap","Primary healing occurs only in cancellous bone; secondary healing is restricted to cortical bone regardless of fixation","Primary healing requires direct contact or minimal gap with rigid fixation and no callus; secondary healing proceeds through haematoma, soft callus, hard callus, and remodelling stages","Primary healing is faster in all scenarios and is always preferred clinically over secondary healing"],
        correctHash: "40b5ee61d05b26d9bf5ee1b0208557d724b8632bdd6f4030d911242a0a1ece6f",
        rationale: "Secondary (indirect) healing is the natural process: haematoma → fibrocartilaginous callus → bony callus → remodelling. Primary healing requires absolute rigid internal fixation with precise anatomical reduction, allowing direct osteonal remodelling across the fracture without a callus."
    },
    {
        system: "Skeletal System",
        stem: "Which transcription factor is considered the master regulator of osteoblast differentiation?",
        options: ["MyoD","PPAR-γ","Runx2 (Cbfa1)","Sox9"],
        correctHash: "dd9efc935b7469ec9f65623378f9c96d8311cef61c883af609bf9bb376cf588a",
        rationale: "Runx2 (Runt-related transcription factor 2) is the essential osteoblast master regulator. Runx2 knockout mice completely lack bone formation. Heterozygous Runx2 mutations in humans cause cleidocranial dysplasia."
    },
    {
        system: "Skeletal System",
        stem: "What is the histological appearance of a Haversian system (osteon) in compact bone?",
        options: ["Disorganised woven bone trabeculae surrounding multiple central vascular canals in a random lattice pattern","Concentric lamellae of mineralised bone matrix surrounding a central canal containing blood vessels and nerves, with osteocytes in lacunae connected by canaliculi","Parallel columns of osteoblasts depositing successive mineralised layers without any central vascular structure","Sheets of type II collagen with embedded chondrocytes arranged in a columnar growth pattern"],
        correctHash: "231186471f133a4844d2b59c7cdb8d8a7c9234d241928123177ea6bf57bb4a40",
        rationale: "Osteons are the structural units of compact bone. Perforating (Volkmann's) canals run perpendicularly to connect Haversian canals. Osteocytes in lacunae communicate via gap junctions through canaliculi, enabling mechanosensation and coordinated remodelling."
    },
    {
        system: "Skeletal System",
        stem: "How does sclerostin (SOST gene product) regulate bone formation?",
        options: ["It stimulates osteoclast differentiation by upregulating RANKL expression on stromal cells","It is secreted by osteocytes and inhibits the Wnt pathway by binding LRP5/6 co-receptors, thereby suppressing osteoblast activity","It directly mineralises osteoid by acting as a nucleation site for hydroxyapatite crystal deposition","It activates BMP signalling to drive mesenchymal stem cell commitment to the osteoblast lineage"],
        correctHash: "9fc364d4c3b9d0eb681de855e3ada6101848383e754adcce1f33b1e48c331d50",
        rationale: "Sclerostin is produced by osteocytes under mechanical unloading. It antagonises Wnt signalling by blocking LRP5/6, reducing osteoblast activity. Anti-sclerostin antibodies (romosozumab) are approved anabolic osteoporosis treatments that exploit this pathway."
    },
    {
        system: "Skeletal System",
        stem: "What is the molecular basis of the triple helix structure of collagen?",
        options: ["Three identical α-chains stabilised by disulfide bonds between cysteine residues at regular intervals","Three polypeptide chains each with a repeating Gly-X-Y motif wound into a right-handed superhelix stabilised by interchain hydrogen bonds, with glycine at every third position essential because it is the only residue small enough to fit the interior","A single polypeptide chain that folds back on itself three times stabilised by hydrophobic interactions in the core","Three β-sheet domains crosslinked by lysyl oxidase-mediated covalent bonds prior to secretion"],
        correctHash: "a810f76c2c694708eeb8d72ea29611ecc128b06074623259d03378bc960789ee",
        rationale: "The Gly-X-Y repeat is critical — Gly at position 3n occupies the sterically restricted central axis. X is often proline (hydroxylated to hydroxyproline by vitamin C-dependent prolyl hydroxylase). Osteogenesis imperfecta often results from Gly substitution mutations disrupting this structure."
    },
    {
        system: "Skeletal System",
        stem: "What is the significance of the epiphyseal growth plate zone of hypertrophy in endochondral ossification?",
        options: ["It is the proliferating zone where chondrocytes actively divide to lengthen the cartilage template","It is where chondrocytes enlarge (hypertrophy), begin secreting type X collagen and VEGF, attract vascular invasion, and undergo apoptosis — creating the scaffold for primary ossification","It is the resting zone where quiescent chondrocytes act as stem cells for subsequent proliferation","It is where osteoblasts first differentiate and begin depositing primary woven bone on the cartilage template"],
        correctHash: "2362e4c18bad285d104d58835f0d26e7139cbd41596d1602da5ed3388e029005",
        rationale: "Hypertrophic chondrocytes are critical orchestrators. Their VEGF secretion drives angiogenesis. Type X collagen facilitates calcification. Their apoptosis leaves calcified cartilage spicules onto which osteoblasts deposit woven bone, creating the primary spongiosa."
    },
    {
        system: "Skeletal System",
        stem: "Duchenne Muscular Dystrophy profoundly affects bone health. What is the primary molecular defect?",
        options: ["Mutations in the COL1A1 gene encoding type I collagen, causing structurally weak bones","Loss-of-function mutations in the dystrophin gene causing absence of the dystrophin-glycoprotein complex from the sarcolemma","Gain-of-function mutations in the myostatin gene causing excessive muscle growth and secondary bone compression","Mutations in the titin gene causing sarcomere instability and progressive myofibrillar disintegration"],
        correctHash: "90a61ba2214b9fa2b7e1a56a90451145f9f9a96259968faf1b6cea04b7b6582d",
        rationale: "Dystrophin connects the intracellular actin cytoskeleton to the extracellular matrix via the dystrophin-glycoprotein complex. Its absence causes membrane fragility, repeated contraction-induced injury, inflammation, and progressive muscle fibre replacement by fat and fibrosis."
    },
    {
        system: "Skeletal System",
        stem: "What is the mechanism by which bisphosphonates treat osteoporosis?",
        options: ["They stimulate osteoblast differentiation by activating the Wnt/β-catenin signalling pathway","They are incorporated into bone matrix and ingested by osteoclasts during resorption, where they inhibit farnesyl pyrophosphate synthase in the mevalonate pathway, causing osteoclast apoptosis","They competitively inhibit RANKL binding to its receptor on osteoclast precursors, preventing their differentiation","They increase intestinal calcium absorption by acting as vitamin D receptor agonists"],
        correctHash: "62ef2fc6b701c14f19872440acef8617a153400b26476b1a336db65a40b154e6",
        rationale: "Nitrogen-containing bisphosphonates (alendronate, zoledronate) inhibit farnesyl pyrophosphate synthase, disrupting prenylation of GTPases (Ras, Rho, Rac) essential for osteoclast cytoskeletal function and survival, ultimately inducing osteoclast apoptosis."
    },
    {
        system: "Skeletal System",
        stem: "What is the role of fibroblast growth factor 23 (FGF23) in mineral metabolism?",
        options: ["It is produced by bone (osteocytes) and acts on the kidney to reduce phosphate reabsorption and suppress active vitamin D production, lowering serum phosphate","It is secreted by the parathyroid glands to increase calcium absorption from bone and intestine","It stimulates osteoblast differentiation and bone mineralisation by activating FGFR1 on osteoblast precursors","It is produced by the kidney to signal phosphate deficiency to osteoclasts, driving bone resorption to release phosphate"],
        correctHash: "c0c2f05ee39b7c4533fb828b7322b31d016a2ea2a84417a3919e7d4a523ee8a2",
        rationale: "FGF23 is a bone-derived hormone (phosphatonin) that reduces renal phosphate reabsorption (via NaPi cotransporters) and suppresses 1α-hydroxylase, lowering 1,25-dihydroxyvitamin D. Excess FGF23 causes hypophosphataemic rickets; deficiency causes hyperphosphataemia and ectopic calcification."
    },
    {
        system: "Skeletal System",
        stem: "In rheumatoid arthritis, what is the role of synovial pannus tissue in joint destruction?",
        options: ["Pannus is a fibrocartilaginous repair tissue that replaces damaged hyaline cartilage with mechanically inferior scar tissue","Pannus is an invasive vascularised granulation tissue derived from hyperplastic synoviocytes that directly erodes cartilage and subchondral bone through protease and cytokine secretion","Pannus forms when synovial fluid accumulates under pressure and mechanically displaces articular cartilage from subchondral bone","Pannus is a layer of immune complexes deposited on the articular surface that activates complement and causes chondrocyte apoptosis"],
        correctHash: "08da3f359b106b2944f966e53fed4572fdc7db891cb11371ddfc36a97b62fcfe",
        rationale: "In RA, activated synoviocytes and infiltrating immune cells form invasive pannus. It secretes MMPs (matrix metalloproteinases) and cathepsins that directly destroy cartilage, while TNF-α and IL-17 drive osteoclast-mediated bone erosion at pannus-bone interfaces."
    },
    {
        system: "Skeletal System",
        stem: "What is the molecular explanation for the increased fracture risk in osteoporosis beyond simply reduced bone mineral density?",
        options: ["Osteoporotic bone uniquely lacks type I collagen entirely, leaving only poorly mineralised osteoid that fractures under minimal stress","Osteoporosis involves not only reduced bone mass but also deterioration of bone microarchitecture (trabecular thinning, perforation, and loss of connectivity) and impaired bone material properties including increased collagen crosslink abnormalities","The reduced BMD leads to compensatory osteoblast hyperactivity producing structurally defective woven bone replacing normal lamellar bone","Fracture risk increases solely due to increased osteoclast activity dissolving periosteal bone, thinning cortical walls without affecting trabecular architecture"],
        correctHash: "65dcc96a584282d28b8b67bd3bc7f2d61586035ba67999d1a94175a7efe4b478",
        rationale: "BMD explains only about 60-70% of fracture risk variance. Trabecular architecture deterioration (perforation of plates, loss of cross-struts) dramatically reduces load-bearing capacity beyond what BMD predicts. Collagen maturation defects and microdamage accumulation further compromise bone quality."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the molecular trigger for exercise-induced mitochondrial biogenesis in skeletal muscle?",
        options: ["Elevated serum insulin concentrations activating PI3K-Akt-mTOR signalling in muscle fibres","PGC-1α (peroxisome proliferator-activated receptor gamma coactivator 1-alpha) activation by AMPK and p38 MAPK in response to energy stress and calcium signalling during exercise","Direct transcriptional activation of mitochondrial DNA by reactive oxygen species produced during exercise","Satellite cell fusion with existing fibres bringing new mitochondria from quiescent muscle stem cells"],
        correctHash: "0418e18333000527742b5cd41a44027d159cca94052f1ce700403041cdff4e81",
        rationale: "PGC-1α is the master regulator of mitochondrial biogenesis. Exercise activates AMPK (low ATP:AMP ratio) and p38 MAPK, which phosphorylate and activate PGC-1α. It then co-activates transcription factors driving expression of both nuclear and mitochondrial genes encoding respiratory chain components."
    },
    {
        system: "Exercise Physiology",
        stem: "Explain the Frank-Starling mechanism of the heart.",
        options: ["Heart rate increases proportionally to venous return due to stretch-activated baroreceptors in the atrial wall","Increased ventricular end-diastolic volume stretches myocardial sarcomeres toward optimal filament overlap, increasing calcium sensitivity of troponin and the force of subsequent contraction without requiring neural input","Sympathetic innervation of the SA node increases stroke volume through positive chronotropy independent of preload","Coronary artery vasodilation increases myocardial oxygen supply, directly increasing ATP availability and contractile force"],
        correctHash: "d8f5bfd6a74b11ae8b153a23846af2cac01f968bad94f1f04906dcaafa24530a",
        rationale: "The Frank-Starling law states that stroke volume increases intrinsically in response to greater preload (ventricular filling). Sarcomere stretch optimises actin-myosin overlap and increases myofilament calcium sensitivity, allowing the heart to automatically match output to venous return."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the significance of the lactate threshold (LT) in exercise physiology?",
        options: ["It is the exercise intensity at which blood lactate first becomes detectable, indicating anaerobic glycolysis has commenced for the first time","It is the exercise intensity above which lactate production exceeds the body's capacity to clear it, causing progressive accumulation — it correlates strongly with endurance performance","It represents the maximal oxygen uptake (VO2max) of the individual and is therefore the primary determinant of aerobic fitness","It is the point at which type I muscle fibres are fully exhausted and type II fibres are exclusively recruited"],
        correctHash: "194cec6a85276587fd59f691687231b65f9cc9acfe29e24449e1d41ee8582a00",
        rationale: "LT (or the related concept OBLA — Onset of Blood Lactate Accumulation at 4 mmol/L) reflects the balance between glycolytic flux and lactate clearance. Athletes with higher LT as a percentage of VO2max sustain faster paces aerobically. Training shifts LT rightward."
    },
    {
        system: "Exercise Physiology",
        stem: "What is excitation-contraction coupling in cardiac muscle, and how does it differ from skeletal muscle?",
        options: ["Cardiac muscle relies entirely on intracellular calcium stores with no calcium influx across the sarcolemma, while skeletal muscle depends entirely on extracellular calcium entering through L-type channels","In cardiac muscle, calcium-induced calcium release (CICR) means trigger calcium entering through L-type channels activates ryanodine receptors (RyR2) to release far more calcium from the SR; skeletal muscle relies primarily on mechanical coupling between DHPR and RyR1 without requiring calcium influx","Both muscle types use identical mechanisms; the only difference is the density of L-type calcium channels in their respective T-tubule membranes","Cardiac muscle contraction is triggered exclusively by IP3-mediated calcium release from the endoplasmic reticulum, while skeletal muscle uses voltage-dependent DHPR-RyR1 coupling"],
        correctHash: "85a7a03a6155a290686bb3b64e01d103f4dec43ac446950a6a66fa63e5bd0de1",
        rationale: "CICR in cardiac muscle means the heart is much more dependent on extracellular calcium and is exquisitely sensitive to drugs and conditions affecting calcium handling (e.g., calcium channel blockers reduce contractility). Skeletal muscle RyR1 is directly gated by DHPR conformational change, making it more self-contained."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the mTORC1 signalling pathway's role in exercise-induced muscle protein synthesis?",
        options: ["mTORC1 suppresses muscle protein synthesis during resistance exercise to conserve amino acids for energy metabolism","Resistance exercise activates mTORC1 through mechanical stimulation, amino acid sensing, and growth factor signalling, driving ribosome biogenesis and mRNA translation to increase muscle protein synthesis rates","mTORC1 exclusively mediates the catabolic response to endurance exercise by activating autophagy and proteasomal degradation pathways","mTORC1 activation during exercise signals satellite cells to proliferate and fuse into existing fibres, which is the sole mechanism of muscle hypertrophy"],
        correctHash: "28ef68a390f3dc077de3a7d95b4b7b94f72ab19d81cced163186745d5be52fee",
        rationale: "mTORC1 phosphorylates p70S6K1 and 4EBP1, promoting ribosome biogenesis and cap-dependent mRNA translation. Leucine is a particularly potent mTORC1 activator via Rag GTPases. mTORC1's role in hypertrophy is confirmed by rapamycin (mTOR inhibitor) blocking exercise-induced muscle growth."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the oxygen dissociation curve, and what is the physiological importance of its sigmoidal shape?",
        options: ["The sigmoidal shape results from random variation in haemoglobin oxygen affinity and has no particular physiological advantage over a hyperbolic curve","The sigmoidal shape reflects cooperative binding: once one oxygen binds, haemoglobin's affinity for subsequent oxygens increases (T→R state transition), enabling efficient loading at high PO2 (lungs) and substantial unloading at lower PO2 (tissues)","The curve is sigmoidal because haemoglobin undergoes irreversible structural changes upon initial oxygenation that permanently increase binding affinity for subsequent oxygen molecules","The sigmoidal shape is produced by the two alpha subunits of haemoglobin binding oxygen before the two beta subunits, creating a sequential rather than cooperative binding pattern"],
        correctHash: "72ef1c880d884934a6f97729bdfcfe656bcd17acb2002a4dfc580225f3ccbc65",
        rationale: "Cooperative binding (allostery) means the T (tense, low-affinity) to R (relaxed, high-affinity) state transition makes haemoglobin ideal for bulk oxygen transport. The steep middle portion of the curve means small PO2 changes in tissues cause large O2 unloading. 2,3-BPG, CO2, H+, and temperature shift the curve rightward (Bohr effect)."
    },
    {
        system: "Exercise Physiology",
        stem: "How does the sympathetic nervous system increase heart rate at the molecular level?",
        options: ["Norepinephrine binds β1-adrenoceptors on SA node cells, activating Gs protein, raising cAMP via adenylyl cyclase, which activates PKA to phosphorylate HCN (funny current) channels, accelerating spontaneous depolarisation rate","Acetylcholine binds nicotinic receptors on SA node cells, opening sodium channels that directly depolarise the pacemaker cells to threshold more rapidly","Sympathetic nerve terminals release ATP that directly opens P2X channels in SA node cells, causing rapid depolarisation independent of second messenger systems","Norepinephrine binds α1-adrenoceptors, activating PLC-IP3 signalling to release calcium from SA node SR, which directly gates voltage-sensitive calcium channels"],
        correctHash: "72e674b10d3f031afc5092cc9cbb7dc2eabde2649894fb8788bf1189f7104d39",
        rationale: "β1-adrenoceptor → Gs → adenylyl cyclase → ↑cAMP → PKA. PKA phosphorylates: HCN4 channels (increases If 'funny current'), L-type Ca2+ channels (increases ICaL, positive inotropy), phospholamban (enhances SR Ca2+ reuptake, positive lusitropy). This comprehensively explains sympathetic cardiac acceleration."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the role of myokines in the systemic health benefits of exercise?",
        options: ["Myokines are degradation products of contractile proteins released during muscle damage that signal immune cells to initiate repair processes exclusively within injured muscle tissue","Myokines are cytokines and peptides secreted by contracting skeletal muscle that act in autocrine, paracrine, and endocrine fashions to mediate inter-organ crosstalk, including anti-inflammatory, metabolic, and neurotrophic effects throughout the body","Myokines exclusively regulate satellite cell activation and muscle regeneration without any significant systemic endocrine effects","Myokines are hormones secreted by the hypothalamus in response to afferent signals from proprioceptors during exercise that coordinate the systemic metabolic response"],
        correctHash: "9a24782739730bfe4b9b18fcc4e8b532cda626208b350e9e699bf35288ea6d67",
        rationale: "Key myokines include IL-6 (anti-inflammatory in exercise context, stimulates fat oxidation), irisin (promotes browning of adipose tissue, neurotrophic), BDNF (neuroplasticity), FGF21 (metabolic regulation), and myostatin (negative regulator of muscle mass). This identifies muscle as a secretory endocrine organ."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the Fick principle and its application to calculating maximal oxygen consumption (VO2max)?",
        options: ["VO2max equals the product of maximum heart rate and body surface area, with oxygen extraction coefficient applied as a correction factor","VO2max = cardiac output × arteriovenous oxygen difference (a-vO2 diff); maximised by both maximal cardiac output and maximal peripheral oxygen extraction, with central cardiac limitations dominating in most individuals","The Fick principle states that VO2max is solely determined by pulmonary diffusing capacity and is therefore unchanged by cardiac training adaptations","VO2max is calculated from the respiratory exchange ratio (RER) at maximal effort, where RER of 1.0 indicates pure carbohydrate oxidation at maximal intensity"],
        correctHash: "077cd980ccdb74eeed9c9973f45df7525c6cdd4603ae77b6bc2d8031b5813ac2",
        rationale: "Adolf Fick's principle: oxygen consumed = cardiac output × (arterial O2 content − venous O2 content). VO2max is limited centrally (maximum cardiac output ~20-25 L/min in trained athletes) and peripherally (a-vO2 diff ~16-17 mL/100mL blood). Training improves both components."
    },
    {
        system: "Exercise Physiology",
        stem: "What molecular mechanism underlies insulin resistance in skeletal muscle with chronic physical inactivity?",
        options: ["Inactivity reduces GLUT4 transporter expression at baseline but does not affect insulin-stimulated translocation to the sarcolemma","Intramyocellular lipid accumulation generates ceramide and diacylglycerol species that activate PKC-θ and inhibit IRS-1 serine phosphorylation, impairing PI3K-Akt-GLUT4 signalling downstream of the insulin receptor","Physical inactivity primarily increases hepatic glucose output rather than impairing skeletal muscle insulin sensitivity directly","Inactivity causes downregulation of the insulin receptor itself through decreased gene transcription driven by reduced mechanical loading of myofibres"],
        correctHash: "0bf49cc3b9fe90d9778c03eec80e73573bc9bc383039746a468d78137247945e",
        rationale: "Lipotoxic intermediates from incomplete fatty acid oxidation activate novel PKCs that serine-phosphorylate IRS-1 (converting it from a PI3K activator to an inhibitor). Exercise reverses this through AMPK-mediated insulin-independent GLUT4 translocation and improved lipid oxidative capacity."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the molecular basis of heat acclimatisation in exercising humans?",
        options: ["Heat acclimatisation involves genetic mutation of temperature-sensitive ion channels within two weeks of repeated heat exposure","Repeated heat stress upregulates heat shock proteins (particularly HSP70), increases plasma volume through aldosterone-mediated sodium and water retention, and improves sudomotor function and cardiovascular stability through adaptations in thermoregulatory centres","Heat acclimatisation is entirely a cardiovascular adaptation involving left ventricular hypertrophy increasing stroke volume during thermal challenge","Acclimatisation involves downregulation of hypothalamic temperature set-point through progressive desensitisation of anterior hypothalamic thermosensitive neurons"],
        correctHash: "24564c907a6f44c7ec77590c4f684f81cf8fa27ede7cb4e43a3a1a9906147d83",
        rationale: "Key acclimatisation adaptations: ↑plasma volume (earlier, more copious sweating), ↑sweat rate with reduced sweat sodium concentration (aldosterone effect), lower core temperature threshold for sweating, reduced cardiovascular strain, and upregulation of cytoprotective HSPs that prevent protein denaturation."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the molecular mechanism of exercise-induced GLUT4 translocation in skeletal muscle?",
        options: ["Exercise activates insulin receptor autophosphorylation through mechanical distortion of the receptor's extracellular domain, initiating the identical signalling cascade as insulin","AMPK activated by low ATP:AMP ratio and CaMKII activated by calcium transients during contraction phosphorylate TBC1D1 and TBC1D4 (AS160), inactivating their GAP activity toward Rab GTPases, allowing GLUT4 storage vesicles to dock and fuse with the sarcolemma","Exercise-induced adrenaline binds β2-adrenoceptors on muscle, activating cAMP-PKA signalling that directly phosphorylates GLUT4 vesicle-associated VAMP2, enabling membrane fusion","Mechanical stretch of the sarcolemma during contraction directly opens mechanosensitive GLUT4 channels embedded in the plasma membrane, bypassing intracellular vesicle trafficking entirely"],
        correctHash: "f3dadc9286f263dbe7e94c5d5bf67d7e7435dab27b5cc65e51850992f04a909f",
        rationale: "TBC1D1 and TBC1D4 are Rab-GAPs that normally keep Rab10/8a in GDP-bound (inactive) state, retaining GLUT4 vesicles intracellularly. AMPK and CaMKII phosphorylation inhibits this GAP activity, activating Rabs and enabling GLUT4 vesicle exocytosis — this is clinically significant for type 2 diabetes management."
    },
    {
        system: "Exercise Physiology",
        stem: "How does detraining affect skeletal muscle at the molecular and fibre-type level?",
        options: ["Detraining exclusively reduces muscle fibre number (hyperplasia reversal) with no changes in individual fibre diameter or metabolic enzyme content","Within weeks, detraining reduces mitochondrial density and oxidative enzyme activity, shifts fibre type composition toward type IIx fibres, decreases capillary density, and reduces muscle protein synthesis rates — with aerobic adaptations lost faster than strength adaptations","Strength adaptations are lost within days of detraining due to rapid sarcomere disassembly, while aerobic enzyme changes persist for months due to mitochondrial longevity","Detraining only affects the nervous system's motor unit recruitment patterns without any structural or biochemical changes in the muscle fibres themselves"],
        correctHash: "7c837a0f72a033b3776295327acc894892d682af312edcc41533474636d12f0a",
        rationale: "Aerobic adaptations (mitochondrial density, oxidative enzymes, capillarity) regress within 2-4 weeks of inactivity. Strength and hypertrophy changes persist longer due to maintained neural drive and slower myofibrillar protein turnover. The 'muscle memory' phenomenon involves epigenetic changes at myonuclei."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the mechanistic basis of overtraining syndrome (OTS)?",
        options: ["OTS results from complete glycogen depletion causing irreversible mitochondrial damage and permanent type I fibre atrophy","OTS likely involves dysregulation of the hypothalamic-pituitary-adrenal axis, chronic systemic inflammation from excessive training load, altered neurotransmitter balance (particularly serotonin:dopamine ratio), and autonomic nervous system imbalance leading to parasympathetic dominance","OTS is caused exclusively by iron deficiency anaemia resulting from increased haemolysis during high-impact exercise","OTS is a purely psychological phenomenon with no demonstrable neuroendocrine or inflammatory biomarker changes distinguishing it from normal training fatigue"],
        correctHash: "3c9ec36bad4d246abd31e999047a5aba9313ec9a45cd5eaf8a2e5003bfcb4f96",
        rationale: "OTS biomarkers are inconsistent but may include elevated cytokines (IL-6, IL-1β), suppressed testosterone:cortisol ratio, altered HPA axis reactivity, and sympathetic-to-parasympathetic ANS shift (reduced HRV). The mechanisms overlap with chronic fatigue syndrome, making diagnosis and treatment challenging."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the molecular role of AMP-activated protein kinase (AMPK) as an energy sensor in skeletal muscle during exercise?",
        options: ["AMPK is activated by rising ATP concentration during exercise and drives anabolic processes including protein synthesis and glycogen deposition to prepare for subsequent bouts","AMPK is activated by increased AMP:ATP ratio (energy deficit) during exercise; it inhibits anabolic pathways (mTORC1, fatty acid synthesis) and activates catabolic pathways (fatty acid oxidation, GLUT4 translocation, mitochondrial biogenesis via PGC-1α) to restore energy balance","AMPK exclusively regulates cardiac muscle energy metabolism and has no significant direct role in skeletal muscle during exercise","AMPK activation during exercise primarily signals satellite cell activation for immediate muscle repair rather than acute metabolic regulation"],
        correctHash: "4ce2a2283fe28a788003faef32c28a3b944df980fb0695ce42095a8fce6e4f7d",
        rationale: "AMPK is the cellular energy rheostat. Its targets in muscle include: ACC (phospho-inhibition→↑fatty acid oxidation), PFK-2 (↑glycolysis), TBC1D1/4 (↑GLUT4), TSC2 (inhibits mTORC1→↓protein synthesis), and PGC-1α (↑mitochondrial biogenesis). This coordinated response is fundamental to metabolic adaptation to exercise."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the molecular mechanism of action of cardiac glycosides (e.g., digoxin) in heart failure?",
        options: ["Digoxin activates β1-adrenoceptors on cardiomyocytes, mimicking sympathetic stimulation to increase heart rate and contractility","Digoxin inhibits Na+/K+-ATPase on cardiomyocytes, raising intracellular Na+, which reduces NCX extrusion of Ca2+, increasing intracellular Ca2+ stores and enhancing contractility; it also increases vagal tone reducing heart rate","Digoxin blocks L-type calcium channels, paradoxically increasing contractility by prolonging the action potential plateau and allowing more calcium to enter","Digoxin activates phosphodiesterase III to prevent cAMP breakdown, elevating intracellular cAMP and activating PKA-mediated phosphorylation of calcium handling proteins"],
        correctHash: "f02d72ca0551049d92531937d6a74485aa629869562bb9c3a746e69d65c979ca",
        rationale: "Na+/K+-ATPase inhibition → [Na+]i rises → NCX (3Na+/Ca2+ exchanger) less able to extrude Ca2+ → [Ca2+]i increases → greater SR loading → stronger contractions. Vagal sensitisation slows the ventricular rate in atrial fibrillation. Narrow therapeutic index makes digoxin toxicity monitoring essential."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "Explain the renin-angiotensin-aldosterone system (RAAS) and its role in blood pressure regulation.",
        options: ["Renin cleaves angiotensinogen to angiotensin I; ACE converts it to angiotensin II; AngII causes vasoconstriction via AT1R, stimulates aldosterone from adrenal cortex increasing renal Na+/water retention, stimulates ADH, and promotes cardiac and vascular remodelling — all raising BP","Renin is released by the posterior pituitary in response to haemorrhage and directly constricts arterioles without requiring conversion to downstream effectors","Aldosterone is the primary initiator of the cascade, being released directly from the adrenal gland in response to reduced baroreceptor firing, subsequently stimulating renin secretion from the JGA","ACE directly converts renin to the active effector angiotensin II, which then stimulates the juxtaglomerular apparatus to produce aldosterone in a positive feedback loop"],
        correctHash: "277ffa2af90d0893f0535759c28390d87bed2cc5fcaa740398ef615bcbfec303",
        rationale: "RAAS is a crucial long-term BP regulator. ACE inhibitors block AngII formation; ARBs block AT1R; aldosterone antagonists (spironolactone) block Na+ retention. AngII also directly stimulates sympathetic outflow, cardiac hypertrophy, and renal proximal tubule Na+ reabsorption independent of aldosterone."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the molecular mechanism of nitric oxide (NO) in vascular smooth muscle relaxation?",
        options: ["NO directly hyperpolarises smooth muscle cell membranes by activating ATP-sensitive potassium channels, reducing calcium entry through voltage-gated channels","NO diffuses into smooth muscle cells and activates soluble guanylate cyclase, increasing cGMP, which activates PKG; PKG phosphorylates myosin light chain kinase (MLCK) reducing its activity, and promotes SR calcium sequestration and KATP channel activation, causing vasodilation","NO binds to prostacyclin receptors on smooth muscle cells, inhibiting phospholipase C and reducing IP3-mediated calcium release from the SR","NO covalently modifies and permanently inactivates voltage-gated L-type calcium channels on vascular smooth muscle, causing irreversible vasodilation that persists well beyond NO's half-life"],
        correctHash: "9187828184acf930f4c61e11cbb5c0984fc7519d99943fa118fe37471bfca20e",
        rationale: "eNOS produces NO from L-arginine in endothelium. cGMP-PKG signalling is the primary pathway: MLCK phosphorylation reduces actin-myosin interaction, while BKCa and KATP channel activation hyperpolarises the membrane. PDE5 inhibitors (sildenafil) potentiate NO signalling by preventing cGMP breakdown."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the pathophysiological mechanism of atherosclerosis at the molecular level?",
        options: ["Atherosclerosis begins when high-density lipoproteins deposit directly into the arterial intima, triggering a foreign body giant cell reaction that calcifies into plaque","LDL particles enter and become retained in the arterial intima where they undergo oxidative modification; oxidised LDL triggers endothelial dysfunction, monocyte recruitment, macrophage foam cell formation, smooth muscle migration, and fibrous cap development over a lipid-rich necrotic core","Atherosclerotic plaques form from calcium phosphate crystals precipitating from supersaturated blood onto damaged endothelium, with lipid accumulation being a secondary phenomenon","Plaque formation begins with platelet adhesion to intact endothelium that releases growth factors causing smooth muscle proliferation, which then passively traps circulating lipoproteins within the vessel wall"],
        correctHash: "f244a6ec61f8e3bac4b7f93219b7de93017802473d8a15f8e3253bbac86fe843",
        rationale: "Key molecular steps: LDL retention → oxidation → SR-A and CD36 scavenger receptor uptake by macrophages → foam cells → fatty streak → VSMC migration driven by PDGF → fibrous cap. Plaque rupture exposes thrombogenic core, triggering ACS. Statins reduce LDL; anti-inflammatory strategies are emerging."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the molecular basis of pulmonary arterial hypertension (PAH)?",
        options: ["PAH results from left heart failure causing passive elevation of pulmonary venous pressure that is transmitted backward to the pulmonary arteries","PAH involves loss-of-function mutations in BMPR2 (bone morphogenetic protein receptor 2) in familial forms, leading to excessive pulmonary arterial smooth muscle cell proliferation and reduced apoptosis; endothelin-1, thromboxane, and reduced prostacyclin/NO further drive vasoconstriction and remodelling","PAH is caused by hypoxic pulmonary vasoconstriction becoming permanent after prolonged altitude exposure, with no role for genetic factors or endothelial dysfunction","PAH results from autoimmune destruction of pulmonary capillary endothelial cells causing progressive obliteration of the pulmonary vascular bed with no involvement of smooth muscle proliferation"],
        correctHash: "f3f31ec8163c9db54733692394e3fb0c9fd3b3ac975f168763de7860a17a8483",
        rationale: "BMPR2 mutations (50-80% of heritable PAH) impair anti-proliferative BMP signalling. Approved therapies target: endothelin axis (bosentan), NO-cGMP axis (sildenafil, riociguat), and prostacyclin pathway (epoprostenol). Imbalance of vasodilators (PGI2, NO) versus vasoconstrictors (ET-1, TXA2) drives both vasoconstriction and proliferative remodelling."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the physiological mechanism of the baroreceptor reflex?",
        options: ["Baroreceptors in the carotid body detect arterial oxygen content and reflexly increase heart rate when PaO2 falls below 60 mmHg via glossopharyngeal afferents","Stretch-sensitive mechanoreceptors in the carotid sinus and aortic arch increase firing with rising arterial pressure; afferent signals via CN IX and X to the NTS increase parasympathetic outflow (reducing HR) and decrease sympathetic outflow (reducing SV and peripheral resistance), buffering acute BP changes","Baroreceptors detect blood viscosity changes and trigger reflex erythropoiesis to normalise oxygen delivery when viscosity falls","Low pressure baroreceptors in the ventricles detect reduced filling and directly activate renin secretion from the JGA through a direct sympathetic reflex arc bypassing the central nervous system"],
        correctHash: "a695497ed37621fe5d3ff501c6f11b88c56bdd5b3defaeca108821615c37a295",
        rationale: "The arterial baroreflex provides rapid (seconds) beat-to-beat BP buffering. It is a negative feedback system — hypertension is corrected by increased vagal inhibition of the heart. Chronic hypertension resets baroreceptors to the higher level. Baroreflex sensitivity is reduced in heart failure, contributing to autonomic imbalance."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is hypoxic pulmonary vasoconstriction (HPV) and what is its proposed molecular mechanism?",
        options: ["HPV is vasodilation of pulmonary arteries in response to low oxygen, directing blood to better-ventilated regions through prostacyclin-mediated smooth muscle relaxation","HPV is constriction of pulmonary arterioles in response to alveolar hypoxia, diverting blood to better-ventilated regions; the mechanism involves mitochondrial reactive oxygen species sensing causing inhibition of Kv channels, membrane depolarisation, L-type Ca2+ channel activation, and smooth muscle contraction","HPV is mediated by endothelin receptors on pulmonary smooth muscle that directly sense dissolved O2 concentration through a haem-containing O2 binding domain","HPV involves ATP release from hypoxic type II pneumocytes activating P2Y receptors on adjacent smooth muscle cells, triggering IP3-mediated calcium release and contraction"],
        correctHash: "abe641e05bca20754642b39450ec4e110b923107cf6d468d4164510ce658591b",
        rationale: "HPV is unique to pulmonary vasculature (systemic vessels dilate to hypoxia). It optimises V/Q matching — hypoxic alveoli have reduced blood flow, preventing perfusion of unventilated lung. In generalised hypoxia (altitude, COPD), HPV becomes maladaptive, causing pulmonary hypertension. HIF-1α drives chronic remodelling."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What are the molecular targets of commonly used antihypertensive drug classes?",
        options: ["ACE inhibitors block renin secretion; ARBs block aldosterone receptors; beta-blockers block α1-adrenoceptors; CCBs block ryanodine receptors in cardiac SR","ACE inhibitors block conversion of AngI→AngII; ARBs block AT1R; beta-blockers reduce sympathetic cardiac drive (HR/SV); CCBs block L-type Ca2+ channels reducing vascular tone and cardiac contractility; thiazides reduce plasma volume","All antihypertensives ultimately act on the same final common pathway of reducing intracellular calcium in smooth muscle through distinct upstream mechanisms converging on cGMP elevation","Beta-blockers directly vasodilate peripheral arteries through β2-adrenoceptor activation; ACE inhibitors stimulate atrial natriuretic peptide release; ARBs block ACE directly rather than angiotensin receptors"],
        correctHash: "7588a1de4ae1c73b21076e8eb161cef2a7d853396dbb386ecef43f2e13b85a41",
        rationale: "These five major classes address different components: RAAS (ACEi, ARB), sympathetic nervous system (β-blocker), smooth muscle calcium handling (CCB), and renal volume (thiazides). Their different mechanisms explain synergistic BP reduction when combined, and their different side-effect profiles guide individualised prescribing."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the mechanism of myocardial stunning and hibernation as adaptations to chronic ischaemia?",
        options: ["Stunning and hibernation both represent permanent structural loss of cardiomyocytes replaced by fibrotic scar tissue that is indistinguishable from infarcted myocardium on imaging","Stunning is prolonged but reversible contractile dysfunction after transient ischaemia-reperfusion (caused by calcium overload and ROS injury); hibernation is chronic downregulation of contractile function in viable myocardium with chronic reduced flow — both are reversible with revascularisation","Stunning refers to permanent reduction in heart rate following ischaemia due to SA node fibrosis; hibernation refers to right ventricular adaptation to chronic pulmonary hypertension","Both stunning and hibernation result from irreversible mitochondrial permeability transition pore opening causing cardiomyocyte metabolic failure, distinguishing them from infarcted zones only by degree of ATP depletion"],
        correctHash: "e414c0d43190ab1492d6bca5a3755721a4fa365a35a37c01f11fcb8dc09b558a",
        rationale: "Distinguishing viable but dysfunctional myocardium (stunned/hibernating) from scar is critical: viable tissue recovers with revascularisation (PCI or CABG) while scar does not. FDG-PET, dobutamine stress echo, and cardiac MRI with gadolinium can identify viability preoperatively."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What molecular changes drive pathological cardiac hypertrophy versus physiological (exercise-induced) cardiac hypertrophy?",
        options: ["Exercise hypertrophy involves cardiomyocyte hypertrophy driven by PI3K(p110α)-Akt-mTOR signalling with normal or enhanced function; pathological hypertrophy activates calcineurin-NFAT and MAPK pathways, driving fetal gene re-expression (β-MHC, ANP, BNP), fibrosis, and impaired diastolic function","Exercise and pathological hypertrophy are molecularly identical — the functional difference reflects only the degree of hypertrophy rather than the signalling pathways engaged","Pathological hypertrophy is purely a consequence of cardiomyocyte hyperplasia (cell number increase) while physiological hypertrophy involves only cardiomyocyte enlargement","Exercise hypertrophy is exclusively driven by the mechanical stretch of cardiac myocytes directly activating sarcomeric protein synthesis without any growth factor receptor involvement"],
        correctHash: "d7df94846ddfcd0fd303379e8202d2deeba1c06b5cbd0321b842fab89af83634",
        rationale: "Physiological: PI3K-Akt-mTOR (IGF-1/insulin signalling), concentric or eccentric geometry, preserved or improved function, reversible. Pathological: calcineurin dephosphorylates NFAT → nuclear translocation → fetal gene program, reactive fibrosis via TGF-β, mitochondrial dysfunction, diastolic and systolic impairment. This distinction is therapeutically and prognostically critical."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the molecular basis of sickle cell disease and how does it affect microvascular blood flow?",
        options: ["A point mutation (Glu6Val) in β-globin causes HbS to polymerise under deoxygenated conditions, distorting erythrocytes into rigid sickle shapes that obstruct microvascular flow, cause vaso-occlusive crises, haemolysis, endothelial dysfunction, and chronic organ damage","Sickle cell disease involves deletion of both β-globin genes, resulting in β-thalassaemia major with compensatory fetal haemoglobin (HbF) production preventing sickling","A point mutation causes HbS to have increased oxygen affinity, preventing normal oxygen unloading to tissues and causing functional anaemia without any change in red cell morphology","HbS polymerisation occurs under fully oxygenated conditions in the pulmonary capillaries, causing primary lung disease with secondary haematological consequences rather than microvascular obstruction"],
        correctHash: "364b364f831c4cdf3cae6c4f7959e0581e53b0b5f7b0e4e75149d1df0ac667cc",
        rationale: "Val6 creates a hydrophobic patch that allows HbS-HbS polymerisation when deoxygenated. Hydroxyurea treatment increases HbF production (which doesn't sickle). Gene therapy strategies include β-globin gene addition and BCL11A silencing to reactivate HbF. Understanding the molecular defect enabled the first disease-modifying treatments."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is von Willebrand factor (vWF) and what is its role in haemostasis?",
        options: ["vWF is a clotting factor produced by hepatocytes that acts in the final common pathway to crosslink fibrin monomers into a stable clot","vWF is a large multimeric glycoprotein produced by endothelial cells and platelets that bridges damaged subendothelial collagen to platelet GPIb receptors under high shear, facilitating primary platelet plug formation; it also acts as a carrier for factor VIII, protecting it from premature degradation","vWF is an anticoagulant protein that prevents inappropriate platelet activation in intact vessels by binding and inactivating thrombin","vWF is synthesised exclusively by megakaryocytes and stored in platelet alpha granules, released only during platelet activation to amplify secondary haemostasis through the intrinsic pathway"],
        correctHash: "42742f716d7e923c8ae75a283037fca8b865baa2751b89c03c326f8daa7bc3bc",
        rationale: "vWD (von Willebrand disease) is the most common inherited bleeding disorder. High shear stress unfolds vWF multimers exposing GPIb binding sites — this shear-dependent adhesion is most critical in arterioles and damaged vessel areas. ADAMTS13 cleaves ultralarge vWF multimers; its deficiency causes TTP."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the molecular cascade of the coagulation pathway leading to fibrin clot formation?",
        options: ["Tissue factor exposed by vascular injury binds factor VIIa (extrinsic pathway), activating factor X; Xa with Va forms prothrombinase converting prothrombin to thrombin; thrombin converts fibrinogen to fibrin monomers that polymerise and are crosslinked by factor XIIIa","The coagulation cascade begins exclusively through the intrinsic pathway when factor XII contacts collagen; the extrinsic pathway is only relevant in laboratory tests and has no in vivo significance","Thrombin is the first activated factor produced by the extrinsic pathway; it then activates all other coagulation factors in sequence before fibrinogen conversion occurs as the terminal step","Fibrinogen spontaneously polymerises into fibrin at sites of vascular injury without requiring enzyme activation; thrombin merely accelerates a thermodynamically favourable spontaneous process"],
        correctHash: "29dea18c3ccb1b2cf940b311cec5e4665f2bc31b62d5bb8d0a721ad29f6f59e2",
        rationale: "TF-VIIa initiates in vivo coagulation (extrinsic); the intrinsic pathway (contact activation) amplifies it. Warfarin inhibits vitamin K-dependent factors (II, VII, IX, X, protein C/S). Direct oral anticoagulants (DOACs) target factor Xa (apixaban, rivaroxaban) or thrombin (dabigatran) directly."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the molecular mechanism of complement system activation in the immune response, and how does it affect vascular permeability?",
        options: ["The complement system is activated exclusively through the classical pathway requiring antigen-antibody complex formation; it has no role in innate immunity or sterile inflammatory conditions","Complement activation (classical, lectin, or alternative pathways) converges on C3 convertase cleaving C3 into C3a and C3b; C3b opsonises pathogens for phagocytosis; C5a is a potent anaphylatoxin causing mast cell degranulation and vascular permeability increase; MAC (C5b-9) directly lyses pathogens","Complement proteins increase vascular permeability by directly binding endothelial tight junction proteins ZO-1 and occludin and causing their proteolytic degradation","Complement activation terminates the inflammatory response by opsonising and clearing inflammatory mediators, reducing rather than increasing vascular permeability during acute inflammation"],
        correctHash: "5eca6832867cf4799de29451e13259685c1941f5e3b265aa1599ea002cf61f5f",
        rationale: "C5a and C3a (anaphylatoxins) bind receptors on mast cells and basophils triggering histamine release, and directly on endothelial cells causing retraction and gap formation. C5a is also a powerful neutrophil chemoattractant. Hereditary angioedema results from C1-inhibitor deficiency causing uncontrolled bradykinin and complement activation."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular basis of long-term potentiation (LTP) and its role in memory formation?",
        options: ["LTP involves permanent insertion of new AMPA receptors into synapses driven by CREB-mediated gene transcription, with NMDA receptor activation merely providing the initial calcium signal that is not itself required for maintenance","LTP is initiated by NMDA receptor activation (requiring simultaneous pre- and postsynaptic activity — Hebb's rule), causing Ca2+ influx activating CaMKII, which phosphorylates and inserts AMPA receptors; late LTP requires CREB-mediated protein synthesis for structural synaptic changes underlying long-term memory","LTP is mediated exclusively by increased presynaptic neurotransmitter release with no postsynaptic structural or functional changes occurring during the induction or maintenance phases","LTP requires the prior removal of existing AMPA receptors (LTD) before new NMDA-receptor-triggered insertion can occur, meaning LTP is always preceded by a transient period of reduced synaptic efficacy"],
        correctHash: "937b677a2a7ce0bca2ef0b52d814a227634ed7314a9ab5be06d21ad93808550c",
        rationale: "NMDA receptors are the Hebbian coincidence detector (voltage-dependent Mg2+ block removed by depolarisation). Ca2+ influx → CaMKII autophosphorylation (enabling sustained kinase activity) → AMPA receptor phosphorylation and exocytosis. Late LTP: BDNF-TrkB signalling, PKA, and CREB drive dendritic spine enlargement and new synapse formation."
    },
    {
        system: "Neuroscience",
        stem: "What is the hypothalamic-pituitary-adrenal (HPA) axis and how does chronic stress alter its function?",
        options: ["CRH from hypothalamus → ACTH from anterior pituitary → cortisol from adrenal cortex; cortisol provides negative feedback to hypothalamus and pituitary; chronic stress causes glucocorticoid receptor downregulation in feedback centres, impairing negative feedback and sustaining elevated cortisol with consequences for immune function, metabolism, neuroplasticity, and mental health","The HPA axis exclusively regulates inflammatory responses; its primary role in stress is to stimulate pro-inflammatory cytokine production to combat infection risk during stressful periods","Chronic stress permanently upregulates HPA axis sensitivity through epigenetic silencing of the CRH promoter, paradoxically reducing cortisol output in the chronic stress state","The HPA axis operates independently of the hypothalamus in chronic stress, with the pituitary directly sensing plasma cortisol and producing ACTH autonomously without hypothalamic CRH input"],
        correctHash: "472bf758768168e5ad499f644e8cec285c69d0d5eacdd3b2c822699c063f16d1",
        rationale: "Chronic stress reduces hippocampal glucocorticoid receptor density (epigenetic mechanisms including FKBP5, NR3C1 methylation), impairing feedback. Sustained hypercortisolaemia causes hippocampal neuronal atrophy (reducing memory/mood regulation), immunosuppression, metabolic syndrome, and increased psychiatric disorder risk. Adverse childhood experiences can epigenetically programme HPA dysregulation."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular mechanism of general anaesthesia at the neuronal level?",
        options: ["General anaesthetics block all voltage-gated sodium channels throughout the CNS, completely abolishing action potential propagation in both sensory and motor pathways simultaneously","The mechanisms vary by agent but commonly include potentiation of inhibitory GABA-A receptor activity, inhibition of excitatory NMDA receptors, and modulation of two-pore domain potassium channels — collectively reducing thalamocortical and corticothalamic connectivity","Inhalational anaesthetics dissolve in neuronal lipid bilayers causing generalised membrane fluidisation that non-specifically reduces the function of all membrane proteins equally","General anaesthetics specifically target and inactivate the reticular activating system through selective high-affinity binding to adenosine A1 receptors on RAS projection neurons"],
        correctHash: "7b7078b0ba3d6b31f712c73053063d281938ae6be97162f268757334dbb7ca66",
        rationale: "Propofol and barbiturates are primarily positive GABA-A allosteric modulators. Ketamine is primarily an NMDA receptor antagonist. Volatile agents (sevoflurane) have multiple targets. The corticothalamic feedback loop disruption hypothesis best explains loss of consciousness — network connectivity collapse rather than synaptic silencing."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular pathology of Alzheimer's disease?",
        options: ["Alzheimer's is caused by prion protein misfolding spreading from cell to cell, distinct from amyloid and tau pathology, which are secondary epiphenomena without mechanistic roles","Alzheimer's involves extracellular deposition of amyloid-β (cleaved from APP by β- and γ-secretases) forming senile plaques, and intracellular accumulation of hyperphosphorylated tau forming neurofibrillary tangles — both driving neuroinflammation, synaptic dysfunction, and neuronal loss","Alzheimer's pathology begins with neuroinflammation driven by TREM2 loss-of-function mutations in microglia, with amyloid and tau being inflammatory products rather than primary pathological drivers","The primary molecular event in Alzheimer's is mitochondrial dysfunction causing ATP depletion in hippocampal neurons, with amyloid and tau accumulation being compensatory responses to energy failure"],
        correctHash: "70d9081247a71d05295bb0c66fc0be3c83ca7a10ed03f762782b894e30117461",
        rationale: "The amyloid cascade hypothesis: APP → Aβ42 (β-secretase/BACE1 + γ-secretase/presenilin) → oligomers → plaques → tau hyperphosphorylation → NFTs. APOE4 is the major genetic risk factor, impairing Aβ clearance. Anti-amyloid antibodies (lecanemab, donanemab) are the first approved disease-modifying treatments targeting this cascade."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular basis of action of selective serotonin reuptake inhibitors (SSRIs) and their proposed mechanism in treating depression?",
        options: ["SSRIs immediately increase serotonin in the synapse by blocking SERT; however, the delayed clinical effect (2-4 weeks) reflects downstream neuroplastic changes including BDNF upregulation, hippocampal neurogenesis, and desensitisation of inhibitory 5-HT1A autoreceptors that initially dampen the net effect of SERT blockade","SSRIs have immediate clinical effects because the immediate synaptic serotonin increase is itself the therapeutic mechanism — the 2-4 week delay is an artefact of gradual drug distribution to all CNS synapses","SSRIs work by blocking serotonin synthesis in the presynaptic neuron, reducing excessive serotonergic signalling that characterises the depressed state according to the serotonin excess hypothesis of depression","SSRIs achieve their antidepressant effect by permanently downregulating serotonin transporter gene expression rather than acutely blocking the transporter protein itself"],
        correctHash: "e3b719d3816b5f6375d0117a4ebf6028455ec8f4d9fbce861667ba9ba9893168",
        rationale: "The lag between SERT blockade and clinical response reveals the complexity of depression neurobiology. Autoreceptor desensitisation, BDNF/TrkB signalling, adult hippocampal neurogenesis, and downstream transcriptional changes (CREB, PGC-1α) are all implicated in delayed therapeutic effects. The 'chemical imbalance' narrative significantly oversimplifies the actual pharmacology."
    },
    {
        system: "Neuroscience",
        stem: "What is the glymphatic system and what is its physiological significance?",
        options: ["The glymphatic system is the brain's dedicated lymphatic vessel network running alongside cerebral arteries that drains interstitial proteins directly into cervical lymph nodes","The glymphatic system is a waste clearance pathway using cerebrospinal fluid flow through para-arterial spaces (Virchow-Robin spaces) driven by astrocytic AQP4 water channels, most active during sleep, clearing metabolic waste including amyloid-β and tau from the brain interstitium","The glymphatic system provides the primary oxygen and glucose supply to deep white matter regions that are too far from capillaries for diffusion alone","The glymphatic system refers to the blood-brain barrier's transcytosis mechanism for selectively shuttling large beneficial proteins like BDNF across the endothelium into the brain parenchyma"],
        correctHash: "20f7a8c70721d9ee87e290f4dbab54091b7d26d52647b2f8662070f02edabed6",
        rationale: "Discovered by Maiken Nedergaard's group (2013), the glymphatic system is most active during non-REM sleep when AQP4 channel polarisation at astrocytic endfeet facilitates CSF-ISF exchange. Sleep deprivation reduces glymphatic clearance and accelerates amyloid accumulation — providing molecular basis for the sleep-dementia link."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular mechanism of opioid analgesia and tolerance?",
        options: ["Opioids bind Toll-like receptors on microglia, reducing neuroinflammation and central sensitisation; tolerance develops through progressive microglial NLRP3 inflammasome desensitisation","Opioids bind Gi-coupled μ-opioid receptors, reducing cAMP and activating inward K+ currents while reducing Ca2+ currents — hyperpolarising neurons and reducing transmitter release; tolerance involves receptor desensitisation via GRK/β-arrestin, internalisation, and upregulation of adenylyl cyclase","Opioids irreversibly block NMDA receptors in the dorsal horn, preventing central sensitisation; tolerance develops through de novo NMDA receptor synthesis that replaces blocked receptors within 24-48 hours","Opioids work exclusively at peripheral nociceptors with no central mechanism; tolerance is explained entirely by opioid metabolism enzyme induction reducing bioavailability"],
        correctHash: "02a150afba5ce8c5206e80d1da07a22ad0d506eca87b4be7aa57cbe195ca5d5e",
        rationale: "μOR → Gi/o → ↓AC → ↓cAMP → ↓PKA → ↑GIRK channel opening → hyperpolarisation + ↓presynaptic Ca2+ → ↓substance P/glutamate release. Tolerance: GRK2 phosphorylates activated μOR → β-arrestin recruitment → desensitisation and internalisation + adenylyl cyclase superactivation. β-arrestin bias is a target for developing analgesics with reduced tolerance and respiratory depression."
    },
    {
        system: "Neuroscience",
        stem: "What are the molecular mechanisms underlying neuropathic pain?",
        options: ["Neuropathic pain is caused exclusively by ongoing peripheral tissue damage continuously activating nociceptors; it resolves when tissue healing is complete without any central nervous system contribution","Neuropathic pain involves peripheral sensitisation (reduced nociceptor thresholds from inflammatory mediators, sodium channel upregulation — particularly Nav1.7/Nav1.8), central sensitisation (NMDA-mediated synaptic potentiation in the dorsal horn), microglial activation releasing pro-nociceptive cytokines, and loss of inhibitory interneuron function","Neuropathic pain is purely a psychological phenomenon without structural or functional changes in the peripheral or central nervous system that could be identified histologically or electrophysiologically","Neuropathic pain results exclusively from demyelination of Aβ tactile fibres that then aberrantly contact pain-processing laminae in the dorsal horn without any role for inflammation or central sensitisation"],
        correctHash: "9a35157c52006af465dca8cab92fc489c3726a423c649354d10deda833114eb7",
        rationale: "Nav1.7 (SCN9A) gain-of-function mutations cause inherited erythromelalgia (extreme pain); loss-of-function causes congenital analgesia — validating it as an analgesic target. Central sensitisation involves wind-up (temporal summation), LTP-like changes in dorsal horn, glial activation, and descending facilitation from the rostral ventromedial medulla."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular mechanism by which hypoxia-inducible factor (HIF-1α) responds to cellular oxygen levels?",
        options: ["HIF-1α protein levels are constitutively high in all cells; hypoxia activates it post-translationally by preventing its nuclear export rather than by affecting its stability or degradation","Under normoxia, prolyl hydroxylase domains (PHDs) hydroxylate HIF-1α using O2, allowing VHL E3 ubiquitin ligase binding and proteasomal degradation; in hypoxia, PHDs are inactive, HIF-1α accumulates, dimerises with HIF-1β, and transcribes hypoxia-response genes including EPO, VEGF, and glycolytic enzymes","HIF-1α is a membrane receptor that transduces hypoxic signals via a conformational change in its oxygen-sensing haem domain, activating JAK-STAT signalling without nuclear translocation","HIF-1α directly senses oxygen through a haemoglobin-like iron-containing domain within the protein itself and is activated by oxygen rather than stabilised by its absence"],
        correctHash: "c2f189db8869de1d5c0c1a6cdbc6877a00fe802e00888c34911527ac472b13f5",
        rationale: "The PHD-VHL-HIF axis is a paradigmatic O2-sensing mechanism (2019 Nobel Prize). PHDs require O2, Fe2+, α-ketoglutarate, and ascorbate as cofactors. HIF-1α targets include EPO (erythropoiesis), VEGF (angiogenesis), LDHA and GLUT1 (glycolysis) — a coordinated adaptation to hypoxia. PHD inhibitors are approved for renal anaemia treatment."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular basis of type 1 diabetes mellitus (T1DM) and why does it cause diabetic ketoacidosis (DKA)?",
        options: ["T1DM results from insulin receptor autoantibodies reducing insulin sensitivity; DKA occurs because reduced glucose uptake causes compensatory activation of hepatic ketogenesis through the same mechanism as starvation","T1DM is an autoimmune disease where T cells and autoantibodies destroy pancreatic β-cells (targeting GAD65, IA-2, insulin, ZnT8), causing absolute insulin deficiency; without insulin, glucagon dominates — activating hepatic glycogenolysis, gluconeogenesis, and unrestrained β-oxidation with ketone body production (acetoacetate, β-hydroxybutyrate) causing metabolic acidosis","T1DM results from KATP channel gain-of-function mutations preventing glucose-stimulated insulin secretion without any autoimmune component or β-cell destruction","DKA in T1DM is caused primarily by renal dysfunction failing to excrete ketone acids rather than by increased ketone production, explaining why it occurs only in patients with concurrent renal impairment"],
        correctHash: "c9d0b90579e84efd515b36f864740bd70791d917d352e6d594cc53fa43c95645",
        rationale: "Absolute insulin deficiency removes all anabolic restraint: catabolic hormones (glucagon, cortisol, catecholamines) dominate → glycogenolysis + gluconeogenesis (hyperglycaemia → osmotic diuresis → dehydration) + lipolysis → free fatty acids → hepatic β-oxidation → acetyl-CoA → ketogenesis. Both metabolic acidosis and dehydration are life-threatening without prompt insulin and fluid resuscitation."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular mechanism of thyroid hormone synthesis and how do antithyroid drugs interfere with it?",
        options: ["Thyroid hormones are synthesised from cholesterol through a series of P450 hydroxylation steps; antithyroid drugs competitively inhibit TSH receptor binding, preventing thyroid gland stimulation","TSH stimulates thyroid follicular cells to take up iodide via NIS, which is oxidised by TPO and incorporated into thyroglobulin tyrosine residues (organification), forming MIT and DIT that are coupled to T3 and T4; thionamides (propylthiouracil, carbimazole) inhibit TPO, blocking organification and coupling, thereby reducing T3/T4 synthesis","Thyroid hormones are synthesised entirely within lysosomes by proteolytic cleavage of a unique thyroid-specific albumin; antithyroid drugs block lysosomal acidification preventing this cleavage","T3 and T4 are synthesised by direct covalent iodination of serum tyrosine transported into follicular cells; antithyroid drugs competitively inhibit the iodine transporter NIS rather than TPO"],
        correctHash: "c020f114ab69602b457ab4569f27e377456515a735b3f2a73b9feb8f5971d0d6",
        rationale: "TPO (thyroid peroxidase) catalyses both oxidation of iodide to iodine and the iodination of thyroglobulin tyrosines. PTU additionally inhibits peripheral T4→T3 conversion by deiodinase. Radioiodine (131I) destroys follicular cells by β-emission. Thyroglobulin retrieval via endocytosis and lysosomal proteolysis releases T3/T4 into blood."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular mechanism by which leptin regulates energy homeostasis?",
        options: ["Leptin is secreted by the stomach proportional to meal size and binds hypothalamic receptors to terminate individual meal episodes through short-term satiety signalling","Leptin is secreted by white adipose tissue proportional to fat mass and acts on hypothalamic arcuate nucleus neurons: activating anorexigenic POMC/CART neurons (increasing α-MSH reducing appetite) and inhibiting orexigenic AgRP/NPY neurons, reducing food intake and increasing energy expenditure via sympathetic activation of brown adipose tissue","Leptin acts exclusively on the liver to suppress hepatic glucose output and fatty acid synthesis, with its appetite-regulatory effects being secondary consequences of normalising metabolic fuel availability","Leptin resistance in obesity develops because adipose tissue secretes progressively less leptin as fat mass increases, creating a deficiency state that drives hyperphagia and further weight gain"],
        correctHash: "19a035bc96d2562872986a90d33bcf95ed5007bbfec54a6ccbf029dbcc00a096",
        rationale: "LepRb (long form) in the arcuate nucleus signals via JAK2-STAT3. Common obesity involves leptin resistance (normal or high leptin but impaired signalling) — caused by endoplasmic reticulum stress, SOCS3 upregulation, impaired leptin transport across the BBB. MC4R downstream of POMC is the most common single-gene cause of human obesity."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular mechanism of glucocorticoid action and why do exogenous steroids cause so many systemic side effects?",
        options: ["Glucocorticoids act exclusively through membrane receptors using rapid non-genomic signalling; their numerous side effects result from these rapid signalling cascades in virtually every tissue within minutes of administration","Glucocorticoids diffuse into cells and bind cytoplasmic glucocorticoid receptors (GR), causing dissociation from HSP90 and nuclear translocation; GR binds GREs activating anti-inflammatory gene transcription and transrepresses AP-1/NF-κB — explaining immunosuppression; the same ubiquitous GR expression in bone, muscle, adipose, CNS, and metabolic tissues explains the extensive side-effect profile","Glucocorticoids are prodrugs activated exclusively in the liver; side effects result from toxic hepatic metabolites rather than direct GR-mediated effects in peripheral tissues","Exogenous glucocorticoids work by mimicking cortisol's permissive effects on catecholamine action without any direct transcriptional mechanisms, explaining their rapid onset but not their delayed side effects"],
        correctHash: "2b8a487e736fd76ab927c987bb13b60677c5b49c58e192db9242733e20b0b169",
        rationale: "GR is expressed in virtually every cell. Therapeutic transrepression of NF-κB and AP-1 requires dissociation from its co-repressors — this is the basis for 'dissociated' steroid development aiming to separate anti-inflammatory transrepression from metabolic transactivation side effects (osteoporosis, hyperglycaemia, muscle wasting, adrenal suppression, psychiatric effects)."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular basis of G-protein coupled receptor (GPCR) signal amplification and termination?",
        options: ["One activated GPCR → one activated G-protein → one effector activation → one second messenger molecule — signal is not amplified but simply transduced; termination occurs through receptor endocytosis","One activated GPCR can activate many G-proteins (amplification 1); each Gαs activates adenylyl cyclase producing many cAMP molecules (amplification 2); each cAMP activates PKA phosphorylating many substrates (amplification 3); termination involves GRK phosphorylation of active GPCR → β-arrestin recruitment → desensitisation, internalisation, and ubiquitination","GPCRs have intrinsic GTPase activity that self-terminates signalling within milliseconds; the β-arrestin system provides secondary amplification rather than desensitisation","GPCR signalling is a simple binary on/off switch with no cascade amplification; the diversity of cellular responses reflects differential G-protein expression rather than signal amplification"],
        correctHash: "1e9eee49baade770e4fcf0cb7abcc4c8a988567711d0ba8245a43c7fffbfd700",
        rationale: "This cascade amplification is fundamental to hormonal pharmacology. The GTPase activity of Gα (slow intrinsic rate accelerated by RGS proteins) terminates Gα signalling. GRK1-7 phosphorylate activated GPCRs; β-arrestin not only desensitises but scaffolds its own signalling complexes — biased agonism exploits this to achieve G-protein signalling without β-arrestin-mediated side effects."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the primary mechanism by which the countercurrent multiplier system in the loop of Henle concentrates urine?",
        options: ["Active reabsorption of water in the descending limb creates the osmotic gradient directly","The ascending limb actively pumps out NaCl while being impermeable to water, and the descending limb is permeable to water but not solutes, together establishing a corticomedullary osmotic gradient that the collecting duct exploits under ADH control","Urea is actively secreted into the ascending limb to draw water passively out of the descending limb by osmosis","The vasa recta actively transport sodium into the medullary interstitium via a primary active transport pump independent of the loop of Henle"],
        correctHash: "b3455a02b135231824f0c6dc74041afa5d35aa3168fd027ea49b909afa71e617",
        rationale: "The thick ascending limb's NaCl pump (impermeable to water) combined with the descending limb's water permeability (impermeable to solute) creates a stepwise osmotic gradient that increases toward the medulla, which the collecting duct uses with ADH-regulated aquaporins to concentrate urine."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "How does the juxtaglomerular apparatus (JGA) regulate glomerular filtration rate (GFR) via tubuloglomerular feedback?",
        options: ["Macula densa cells sense NaCl delivery to the distal tubule; when delivery is high, they signal via adenosine to constrict the afferent arteriole, reducing GFR; when low, renin release increases GFR indirectly through the RAAS","The JGA directly measures glomerular capillary pressure using baroreceptors embedded in the afferent arteriole wall and adjusts efferent arteriole tone accordingly","Macula densa cells respond exclusively to potassium concentration, releasing aldosterone locally to modulate afferent arteriolar resistance","Tubuloglomerular feedback operates independently of the macula densa, instead relying on mesangial cell stretch receptors that detect filtration rate directly"],
        correctHash: "e1b76ff57ba87fa7d1b9801c6e57455acd8d113ce2f5702f6dab2edf94808610",
        rationale: "This negative feedback loop protects nephrons from over-filtration. High distal NaCl delivery (suggesting excessive GFR) triggers macula densa adenosine release, causing afferent arteriolar vasoconstriction to reduce GFR back toward normal — a key renal autoregulatory mechanism."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the pathophysiological basis of type 2 diabetes mellitus at the molecular level, distinguishing it from type 1?",
        options: ["Type 2 diabetes results from autoimmune β-cell destruction identical to type 1 but occurring more slowly over decades","Type 2 diabetes involves peripheral insulin resistance (impaired PI3K-Akt-GLUT4 signalling in muscle and adipose tissue) combined with progressive β-cell dysfunction and relative insulin deficiency, often associated with obesity-driven chronic low-grade inflammation and lipotoxicity","Type 2 diabetes is caused exclusively by excessive glucagon secretion with normal insulin sensitivity and β-cell function throughout the disease course","Type 2 diabetes results from a single-gene mutation in the insulin gene itself, causing production of a structurally defective insulin molecule with reduced receptor affinity"],
        correctHash: "3f4bda78f98b1a077e5e569a9259767a516900976df57867c35d61e579f99834",
        rationale: "Unlike T1DM's absolute insulin deficiency from autoimmune destruction, T2DM is a progressive disease of insulin resistance plus relative β-cell failure. Adipose-derived inflammatory cytokines (TNF-α, IL-6) and ectopic lipid deposition drive insulin resistance; chronic hyperglycaemia further stresses and eventually exhausts β-cells (glucotoxicity)."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the role of the countercurrent exchanger function of the vasa recta in the kidney?",
        options: ["The vasa recta actively generate the medullary osmotic gradient through primary active NaCl transport, independent of the loop of Henle","The vasa recta passively follow the geometry of the loop of Henle, allowing blood to equilibrate with the surrounding gradient without washing it out, thereby preserving the medullary concentration gradient established by the nephron","The vasa recta actively secrete urea into the medullary interstitium to independently establish the osmotic gradient without input from the loop of Henle","The vasa recta transport oxygen preferentially to the renal cortex, bypassing the medulla entirely to prevent hypoxic injury to concentrating segments"],
        correctHash: "234d707225d775968655bb9e5763d9152350c34b1f320133ba51066a25cb23bb",
        rationale: "If blood flow through the medulla were straight rather than hairpin-shaped, it would rapidly wash out the osmotic gradient. The countercurrent arrangement of the vasa recta allows blood to pick up and drop off solutes as it travels down and back up, preserving medullary hypertonicity."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the mechanism of action of loop diuretics such as furosemide?",
        options: ["They inhibit the Na+/K+/2Cl- (NKCC2) cotransporter on the luminal membrane of the thick ascending limb, reducing NaCl reabsorption and disrupting the medullary concentration gradient, resulting in substantial diuresis","They act on the distal convoluted tubule to inhibit the Na+/Cl- cotransporter, producing a milder diuresis than thiazides","They block aldosterone receptors in the collecting duct, reducing sodium reabsorption and potassium secretion","They inhibit carbonic anhydrase in the proximal tubule, reducing bicarbonate reabsorption and producing mild diuresis with metabolic acidosis"],
        correctHash: "ea12eb1b5488e43bba1f1d26e18be44044e9b67e5d7b0221a3b622d0d436927c",
        rationale: "NKCC2 inhibition in the thick ascending limb is particularly potent because this segment normally reabsorbs a large fraction of filtered sodium and is essential for generating the medullary gradient — its blockade produces the most powerful class of diuretics, useful in heart failure and pulmonary oedema."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "How does the body respond to metabolic acidosis at the renal level over hours to days?",
        options: ["The kidneys increase bicarbonate excretion and reduce ammonium production to further lower blood pH toward a new compensated baseline","The kidneys increase ammoniagenesis (particularly glutamine metabolism in proximal tubule cells) to enhance net acid excretion as NH4+, while also increasing bicarbonate reabsorption and new bicarbonate generation","The kidneys respond by increasing filtration rate exclusively, without altering tubular acid-base handling directly","Renal compensation for metabolic acidosis occurs within minutes through direct hydrogen ion secretion into the renal vein"],
        correctHash: "39769533d57724467997148f5e9336b3f212789c8899fe2b391dc35696612895",
        rationale: "Renal compensation for acidosis is slower (days) than respiratory compensation (minutes-hours) but more complete. Increased glutamine metabolism generates NH4+ and new HCO3-, allowing net acid excretion while regenerating buffering capacity — critical in chronic conditions like renal tubular acidosis or ketoacidosis."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the role of atrial natriuretic peptide (ANP) in fluid and electrolyte homeostasis?",
        options: ["ANP is released by atrial myocytes in response to atrial stretch (volume overload); it promotes natriuresis and diuresis by increasing GFR, inhibiting renin and aldosterone release, and directly inhibiting sodium reabsorption in the collecting duct","ANP is released by ventricular myocytes in response to reduced stretch and acts to conserve sodium and water, opposing the actions of aldosterone","ANP is secreted by the kidneys themselves in response to low blood pressure, acting as a vasoconstrictor to restore perfusion pressure","ANP acts exclusively on the central nervous system to increase thirst and antidiuretic hormone release during volume depletion"],
        correctHash: "5d6313eaa518d0fbef9881bde53cce2e35a7eb6dda6f291f994182ee64476735",
        rationale: "ANP is part of the body's counter-regulatory system to RAAS, released when atrial stretch signals volume excess. Its natriuretic and vasodilatory actions promote sodium and water excretion, providing negative feedback against volume overload — clinically relevant in heart failure (BNP is used diagnostically)."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the mechanism underlying the anion gap in metabolic acidosis, and what does an elevated gap indicate?",
        options: ["The anion gap reflects unmeasured cations; an elevated gap always indicates renal failure regardless of other clinical findings","The anion gap (Na+ − [Cl- + HCO3-]) reflects unmeasured anions in plasma; an elevated gap suggests accumulation of organic acids (lactate, ketoacids, toxins) rather than simple bicarbonate loss, which would produce a normal-gap (hyperchloraemic) acidosis instead","The anion gap is a direct measurement of arterial pH and does not require calculation from electrolyte values","An elevated anion gap indicates respiratory rather than metabolic acidosis due to CO2 retention affecting chloride distribution"],
        correctHash: "99e3ce3e382e072ae5bf2d68e566b22fdcedf1dafb904520ecbe7082d6934b7a",
        rationale: "Distinguishing high-gap (lactic acidosis, ketoacidosis, toxic ingestions like methanol or ethylene glycol) from normal-gap acidosis (diarrhoea, renal tubular acidosis) is clinically essential for diagnosis. In high-gap acidosis, the accumulating unmeasured anion (lactate, acetoacetate) replaces bicarbonate without a compensatory chloride rise."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the molecular mechanism of action of SGLT2 inhibitors (e.g., empagliflozin) in treating type 2 diabetes?",
        options: ["SGLT2 inhibitors block glucose reabsorption in the proximal tubule by inhibiting the sodium-glucose cotransporter 2, promoting glucosuria and lowering blood glucose independent of insulin secretion or action, while also producing modest natriuresis and cardiovascular/renal protective effects","SGLT2 inhibitors stimulate pancreatic β-cells to increase insulin secretion in a glucose-dependent manner, similar to sulfonylureas but with a different receptor target","SGLT2 inhibitors act centrally on the hypothalamus to reduce appetite and food intake, producing weight loss as their primary glucose-lowering mechanism","SGLT2 inhibitors block hepatic gluconeogenesis by inhibiting glucose-6-phosphatase, similar to the mechanism of metformin"],
        correctHash: "4667fbdeb3557a4aeb7e4a3609055641a4df105b3ae8405ab05ab5464f6167e9",
        rationale: "SGLT2 normally reabsorbs about 90% of filtered glucose in the proximal tubule. Blocking it causes glucosuria (lowering blood glucose insulin-independently) and mild osmotic diuresis/natriuresis. Landmark trials (EMPA-REG, DAPA-HF) showed unexpected cardiovascular and renal protective benefits beyond glycaemic control, now expanding their use to heart failure and CKD."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the physiological significance of the renal autoregulation of blood flow across a wide range of arterial pressures?",
        options: ["Renal autoregulation relies entirely on sympathetic neural reflexes triggered by baroreceptors in the renal artery wall to maintain constant flow","Renal blood flow and GFR remain relatively constant across a mean arterial pressure range of roughly 80-180 mmHg through myogenic and tubuloglomerular feedback mechanisms intrinsic to the kidney, protecting the glomerular capillaries from pressure-related damage while maintaining stable filtration","The kidney has no autoregulatory capacity and renal blood flow varies linearly and directly with systemic arterial pressure at all times","Autoregulation in the kidney functions exclusively through hormonal mechanisms involving circulating angiotensin II with no intrinsic myogenic component"],
        correctHash: "8b51c53f513d7547ffff4b32954392453782ec16b310c86e9e63acd307b492be",
        rationale: "The myogenic mechanism (stretch-induced afferent arteriolar constriction with rising pressure) works alongside tubuloglomerular feedback to keep GFR remarkably stable despite blood pressure fluctuations during daily activities, protecting the glomerulus from barotrauma while ensuring consistent filtration and waste clearance."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "How does the counter-regulatory hormonal response to hypoglycaemia protect against dangerously low blood glucose?",
        options: ["Only insulin suppression occurs; no counter-regulatory hormones are released until blood glucose falls below 20 mg/dL","Glucagon is released first, stimulating hepatic glycogenolysis and gluconeogenesis; if hypoglycaemia persists, epinephrine, cortisol, and growth hormone are progressively recruited to further raise blood glucose through complementary mechanisms including reduced peripheral glucose uptake","Growth hormone is the primary and fastest-acting counter-regulatory hormone, acting within seconds to raise blood glucose via direct glycogenolysis","Cortisol is released within seconds of hypoglycaemia onset and is solely responsible for the entire counter-regulatory response without contribution from other hormones"],
        correctHash: "fc0faae723f200d8ff5c85f3b4f4061986819720f347d116ee83c6b721b390bc",
        rationale: "This hierarchical, redundant system reflects the critical importance of maintaining glucose supply to the brain. Glucagon is the first-line and most important acute responder; epinephrine becomes crucial when glucagon response is impaired (as in longstanding type 1 diabetes), while cortisol and growth hormone provide sustained support during prolonged hypoglycaemia."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the mechanism by which the kidney regulates potassium balance via principal cells in the collecting duct?",
        options: ["Principal cells reabsorb potassium via an apical Na+/K+-ATPase pump that directly exchanges sodium for potassium across the luminal membrane","Aldosterone increases the activity of the basolateral Na+/K+-ATPase and apical ENaC sodium channels in principal cells, creating an electrochemical gradient that drives potassium secretion through apical ROMK channels into the tubular lumen","Potassium secretion in the collecting duct occurs independently of sodium reabsorption and is regulated exclusively by direct potassium sensing at the apical membrane","Principal cells exclusively reabsorb potassium during hyperkalaemia through an active transport mechanism unrelated to sodium handling"],
        correctHash: "bc4ed1695bb330c90e44de66309a0eb90cb70c5db166b31b2b016b80a80f4a6f",
        rationale: "Aldosterone-driven sodium reabsorption through ENaC creates a lumen-negative electrical gradient that favours potassium exit through ROMK channels. This coupling explains why conditions of aldosterone excess (Conn's syndrome) cause hypokalaemia, while aldosterone deficiency or ENaC blockade (amiloride, spironolactone) causes hyperkalaemia."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the molecular basis of erythropoietin (EPO) production and its clinical relevance in chronic kidney disease?",
        options: ["EPO is produced by renal interstitial fibroblast-like cells in response to hypoxia via HIF-2α stabilisation; chronic kidney disease damages these EPO-producing cells, causing normocytic normochromic anaemia that can be treated with recombinant EPO or HIF-prolyl hydroxylase inhibitors","EPO is produced exclusively by the liver in adults and its production is entirely unaffected by renal disease, meaning CKD-associated anaemia has an entirely different mechanism","EPO production increases in chronic kidney disease due to compensatory hyperfiltration in remaining nephrons, but the anaemia results from a separate iron deficiency mechanism unrelated to EPO levels","EPO acts directly on hepatocytes to stimulate haemoglobin synthesis without any effect on bone marrow erythroid progenitor cells"],
        correctHash: "0b8ac83fa45b0c5b1b6e6ef954b948161e2dc02f4bb7f691918b3a72e33fbeea",
        rationale: "Renal peritubular interstitial cells are the primary adult EPO source, using HIF-2α as the main oxygen-sensing transcription factor for this specific gene. CKD progressively destroys this EPO-producing tissue, causing anaemia proportional to disease severity — a key reason CKD patients need EPO-stimulating agents or newer HIF-PHD inhibitors like roxadustat."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the pathophysiological mechanism of nephrotic syndrome at the glomerular filtration barrier level?",
        options: ["Nephrotic syndrome results from complete cessation of glomerular filtration due to mesangial cell proliferation obstructing all capillary loops","Nephrotic syndrome results from damage to the podocyte foot processes and glomerular basement membrane (effacement, loss of slit diaphragm proteins like nephrin), increasing permeability to plasma proteins, causing massive proteinuria, hypoalbuminaemia, oedema, and hyperlipidaemia","Nephrotic syndrome is caused exclusively by tubular protein reabsorption failure with a structurally normal glomerular filtration barrier","Nephrotic syndrome results from complete loss of renal blood flow causing ischaemic protein leakage from damaged peritubular capillaries"],
        correctHash: "0fed7d2ca7c51bba1477d917f376e2b72eb788ee55a4cf1d726e78fe9f0f0b53",
        rationale: "The podocyte slit diaphragm (containing nephrin, podocin) is the final size-selective and charge-selective barrier to protein filtration. Its disruption in conditions like minimal change disease or focal segmental glomerulosclerosis causes the classic tetrad: heavy proteinuria, hypoalbuminaemia, oedema (from reduced oncotic pressure), and compensatory hepatic hyperlipidaemia."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the role of the enzyme 11β-hydroxysteroid dehydrogenase type 2 (11β-HSD2) in mineralocorticoid receptor specificity?",
        options: ["11β-HSD2 activates cortisol into cortisone in mineralocorticoid target tissues, allowing cortisol to bind and activate the mineralocorticoid receptor alongside aldosterone","11β-HSD2 converts cortisol to inactive cortisone in mineralocorticoid target tissues (like the kidney), protecting the mineralocorticoid receptor from cortisol despite cortisol's equal affinity for the receptor and much higher circulating concentration than aldosterone","11β-HSD2 has no functional role in receptor specificity and mineralocorticoid receptor selectivity is achieved entirely through differences in receptor structure between tissues","11β-HSD2 exclusively metabolises aldosterone, reducing its availability to bind the mineralocorticoid receptor in the presence of high cortisol levels"],
        correctHash: "a688dc076e61ad776ffee348219c7a2963497a03e3bda0e0a9c477f6750f6b9d",
        rationale: "This 'cortisol-cortisone shuttle' is essential because cortisol circulates at roughly 100-1000 times the concentration of aldosterone and binds the mineralocorticoid receptor with similar affinity. 11β-HSD2 deficiency (or inhibition by liquorice-derived glycyrrhetinic acid) causes apparent mineralocorticoid excess syndrome, with severe hypertension and hypokalaemia despite normal aldosterone levels."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the mechanism by which chronic hyperglycaemia leads to diabetic nephropathy at the molecular level?",
        options: ["Hyperglycaemia causes direct osmotic destruction of nephrons through simple dehydration of renal tubular cells with no other biochemical mechanisms involved","Chronic hyperglycaemia drives advanced glycation end-product (AGE) formation, activates protein kinase C, increases polyol pathway flux, and promotes TGF-β-mediated mesangial matrix expansion and glomerular basement membrane thickening, ultimately causing glomerulosclerosis and progressive proteinuria","Diabetic nephropathy results exclusively from recurrent urinary tract infections caused by glucosuria providing a nutrient source for bacteria, with no direct glucose-mediated glomerular damage","Hyperglycaemia protects the kidney from nephropathy by increasing osmotic diuresis, which is why nephropathy only occurs in well-controlled diabetes with normal glucose levels"],
        correctHash: "166b4bc6c557b52951c6688f14d6da17f8ca98d6fc738125e0fa822a1856d447",
        rationale: "These interconnected pathways (AGE formation, PKC activation, polyol pathway, hexosamine pathway) converge on TGF-β upregulation, driving mesangial expansion and basement membrane thickening — the classic pathological features preceding clinical diabetic nephropathy, the leading cause of end-stage renal disease worldwide."
    },
    {
        system: "Renal & Metabolic Physiology",
        stem: "What is the mechanism of action of carbonic anhydrase inhibitors (e.g., acetazolamide) and their effect on acid-base balance?",
        options: ["They inhibit carbonic anhydrase in the proximal tubule, reducing bicarbonate reabsorption and causing mild diuresis along with a metabolic acidosis due to bicarbonate loss in the urine","They stimulate carbonic anhydrase activity, increasing bicarbonate reabsorption and causing metabolic alkalosis as their primary acid-base effect","They act on the collecting duct to block aldosterone-mediated sodium reabsorption, producing diuresis without any acid-base disturbance","They inhibit the NKCC2 transporter in the thick ascending limb, producing the same mechanism and acid-base profile as loop diuretics"],
        correctHash: "aee7d74858357b195950d68d0cdb128d4d05f755d5ce75029d63cc400a9e32b4",
        rationale: "Carbonic anhydrase catalyses CO2 + H2O ⇌ H2CO3 ⇌ H+ + HCO3-, essential for proximal tubule bicarbonate reabsorption. Inhibition causes bicarbonaturia, mild diuresis, and a self-limiting metabolic acidosis — a property exploited therapeutically in altitude sickness (respiratory stimulation) and glaucoma (reduced aqueous humour production)."
    },
],
    
};


DOM.controls.initBtn.addEventListener('click', initializeAssessment);
DOM.controls.submitBtn.addEventListener('click', submitAnswer);
DOM.controls.nextBtn.addEventListener('click', advanceItem);
DOM.controls.finalizeBtn.addEventListener('click', concludeExamination);
DOM.controls.restartBtn.addEventListener('click', () => switchView(DOM.views.welcome));

DOM.controls.globalBack.addEventListener('click', () => {
    stopTimer();
    switchView(DOM.views.welcome);
});

window.addEventListener('beforeunload', () => clearInterval(AppState.timer));

})();
