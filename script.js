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
                system: "Heart & Lungs",
        stem: "When you feel your pulse at your wrist, what are you actually feeling?",
        options: ["Your bones tapping", "Your arteries bouncing with each heartbeat", "Your nerves tingling", "Your muscles twitching"],
        k: 0,
        rationale: "Every time your heart beats it pushes a wave of blood through your arteries, making them bulge slightly. You can feel that gentle bounce as your pulse!"
    },
    {
        system: "Heart & Lungs",
        stem: "What is the name of your main windpipe that carries air down to your lungs?",
        options: ["Esophagus", "Trachea", "Larynx", "Pharynx"],
        k: 0,
        rationale: "Your trachea has stiff C-shaped rings of cartilage keeping it open like a flexible vacuum hose so air can always flow freely down to your lungs!"
    },
    {
        system: "Heart & Lungs",
        stem: "What are the tiny air sacs inside your lungs where oxygen enters your blood?",
        options: ["Bronchi", "Alveoli", "Capillaries", "Ventricles"],
        k: 0,
        rationale: "You have about 600 million alveoli in your lungs! These tiny balloon-like sacs have super thin walls so oxygen can easily pass through into your blood."
    },
    {
        system: "Heart & Lungs",
        stem: "What clever flap snaps shut over your windpipe when you swallow food?",
        options: ["The uvula", "The epiglottis", "The tonsil", "The tongue"],
        k: 0,
        rationale: "The epiglottis is like a trapdoor! Every time you swallow it flips down over your windpipe so food goes down your food pipe instead of into your lungs."
    },
    {
        system: "Heart & Lungs",
        stem: "How many chambers (rooms) does your heart have?",
        options: ["Two", "Three", "Four", "Six"],
        k: 1,
        rationale: "Your heart has four chambers — two on top (atria) to receive incoming blood, and two on the bottom (ventricles) to pump blood out to your body and lungs!"
    },
    {
        system: "Heart & Lungs",
        stem: "Which type of blood cell carries oxygen around your body?",
        options: ["White blood cells", "Red blood cells", "Platelets", "Plasma"],
        k: 0,
        rationale: "Red blood cells are packed with a special protein called haemoglobin that grabs onto oxygen and carries it like little delivery parcels to every cell in your body!"
    },
    {
        system: "Heart & Lungs",
        stem: "What sticks together to plug a cut and stop you from bleeding?",
        options: ["Red blood cells", "White blood cells", "Platelets", "Plasma"],
        k: 1,
        rationale: "Platelets are tiny cell fragments that rush to any cut and clump together to build a sticky plug — that's what eventually forms the scab you see on a scrape!"
    },

    /* ---- DIGESTION (15) ---- */
    {
        system: "Digestion",
        stem: "Where does digestion start?",
        options: ["In your stomach", "In your mouth", "In your intestines", "In your throat"],
        k: 0,
        rationale: "Digestion begins the moment you take a bite! Your teeth chew food into smaller pieces and your saliva starts breaking it down straight away."
    },
    {
        system: "Digestion",
        stem: "What does your stomach make to help break down food?",
        options: ["Saliva", "Bile", "Stomach acid", "Blood"],
        k: 1,
        rationale: "Your stomach makes a very strong acid that breaks food down into a liquid mush. A special layer of slime protects your stomach walls from being burned by its own acid!"
    },
    {
        system: "Digestion",
        stem: "What is the long twisty tube that absorbs nutrients from your food?",
        options: ["Large intestine", "Small intestine", "Esophagus", "Stomach"],
        k: 0,
        rationale: "Your small intestine is actually over 20 feet long even though it is narrow! It absorbs almost all the vitamins and nutrients from your food."
    },
    {
        system: "Digestion",
        stem: "What is the main job of the large intestine?",
        options: ["Make stomach acid", "Absorb water from waste", "Produce bile", "Chew food"],
        k: 0,
        rationale: "The large intestine is like a water recycling machine! It soaks up leftover water from your food waste so your body stays hydrated."
    },
    {
        system: "Digestion",
        stem: "Which organ cleans your blood and does over 500 jobs at once?",
        options: ["Kidneys", "Stomach", "Liver", "Pancreas"],
        k: 1,
        rationale: "Your liver is an amazing multitasker! It filters toxins out of your blood, stores energy, and produces bile to help digest fatty foods."
    },
    {
        system: "Digestion",
        stem: "What liquid does the liver make to break down fatty foods like butter and cheese?",
        options: ["Saliva", "Bile", "Acid", "Insulin"],
        k: 0,
        rationale: "Bile is a green liquid that works exactly like dish soap — it breaks big globs of fat into tiny droplets so your body can absorb them easily!"
    },
    {
        system: "Digestion",
        stem: "What is the name of the food pipe that carries food from your mouth down to your stomach?",
        options: ["Trachea", "Esophagus", "Urethra", "Intestine"],
        k: 0,
        rationale: "The esophagus squeezes food down to your stomach using wave-like muscle movements. It's so powerful it can push food down even if you were hanging upside down!"
    },
    {
        system: "Digestion",
        stem: "What is the watery liquid in your mouth that starts digestion?",
        options: ["Bile", "Acid", "Saliva", "Plasma"],
        k: 1,
        rationale: "Saliva keeps your mouth moist, contains enzymes that begin breaking down food, and makes food slippery enough to swallow. You make about 1-2 litres every day!"
    },
    {
        system: "Digestion",
        stem: "What are the tiny finger-like bumps inside your small intestine that absorb nutrients?",
        options: ["Cilia", "Villi", "Alveoli", "Pores"],
        k: 0,
        rationale: "Villi are millions of tiny absorbing bumps that give your intestine as much surface area as a whole tennis court — making sure nothing good goes to waste!"
    },
    {
        system: "Digestion",
        stem: "Which organ sits beside your stomach and makes insulin to control sugar levels?",
        options: ["The liver", "The pancreas", "The gallbladder", "The spleen"],
        k: 0,
        rationale: "The pancreas does two big jobs! It makes digestive enzymes to break down food, and produces insulin to keep your blood sugar at a healthy level."
    },
    {
        system: "Digestion",
        stem: "About how long does it take for food to travel all the way through your digestive system?",
        options: ["10 minutes", "1 hour", "24 to 72 hours", "One week"],
        k: 1,
        rationale: "Digestion is a slow journey! While food leaves your stomach after a few hours, it can take up to three whole days to complete the full trip through your intestines."
    },
    {
        system: "Digestion",
        stem: "What is the hardest substance your body makes?",
        options: ["Bone", "Fingernail", "Tooth enamel", "Cartilage"],
        k: 1,
        rationale: "Tooth enamel is even harder than bone! It coats the outside of your teeth to protect them while you chew tough and crunchy foods."
    },
    {
        system: "Digestion",
        stem: "What causes the rumbling sound in your tummy when you're hungry?",
        options: ["Your bones grinding", "Air and juices moving through empty intestines", "Your heart beating", "Your blood flowing"],
        k: 0,
        rationale: "When your stomach and intestines are empty, the muscles still squeeze automatically — and that makes the gurgling and rumbling sound you hear when you're hungry!"
    },
    {
        system: "Digestion",
        stem: "What do your kidneys produce to flush waste out of your body?",
        options: ["Bile", "Saliva", "Urine (pee)", "Sweat"],
        k: 1,
        rationale: "Your two kidneys filter your entire blood supply about 40 times every day, removing waste and extra water to make yellow urine stored in your bladder!"
    },
    {
        system: "Digestion",
        stem: "When you burp after drinking fizzy soda, where does the burp come from?",
        options: ["Your lungs", "Your stomach", "Your intestines", "Your throat"],
        k: 0,
        rationale: "Fizzy drinks are full of carbon dioxide bubbles! The bubbles collect in your stomach until the top opens up and lets them escape as a big burp!"
    },
            /* ---- BRAIN & SENSES (15) ---- */
    {
        system: "Brain & Senses",
        stem: "What is the name of the amazing organ inside your head that controls everything you do?",
        options: ["The heart", "The liver", "The brain", "The stomach"],
        k: 1,
        rationale: "Your brain is your body's supercomputer! It controls your thoughts, movements, feelings, and automatically runs all your vital body functions."
    },
    {
        system: "Brain & Senses",
        stem: "How many senses do humans have?",
        options: ["Three", "Four", "Five", "Seven"],
        k: 1,
        rationale: "The five main senses are sight, hearing, smell, taste, and touch! Each one collects information from the world around you and sends it to your brain."
    },
    {
        system: "Brain & Senses",
        stem: "What do your eyes use to let in light?",
        options: ["The iris", "The pupil", "The cornea", "The retina"],
        k: 0,
        rationale: "Your pupil is the dark circle in the middle of your eye. It's actually an opening that gets bigger in the dark to let in more light and smaller in bright sunshine!"
    },
    {
        system: "Brain & Senses",
        stem: "What is the coloured ring around your pupil called?",
        options: ["Cornea", "Retina", "Iris", "Lens"],
        k: 1,
        rationale: "Your iris can be blue, green, brown, hazel, or grey — no two people have the exact same iris pattern! It controls how much light enters your eye."
    },
    {
        system: "Brain & Senses",
        stem: "Which body part do you use to hear sounds?",
        options: ["Your nose", "Your eyes", "Your ears", "Your tongue"],
        k: 1,
        rationale: "Sound waves travel into your ear canal and make your eardrum vibrate. Those vibrations are turned into signals that your brain understands as sound!"
    },
    {
        system: "Brain & Senses",
        stem: "What are the tiny bumps on your tongue that detect flavours called?",
        options: ["Villi", "Taste buds", "Papillae", "Cilia"],
        k: 0,
        rationale: "You have around 10,000 taste buds spread across your tongue! They can detect sweet, salty, sour, bitter, and savoury flavours."
    },
    {
        system: "Brain & Senses",
        stem: "What connects your brain to the rest of your body through your spine?",
        options: ["Spinal cord", "Backbone", "Aorta", "Trachea"],
        k: 3,
        rationale: "The spinal cord is a thick bundle of nerves running through your backbone. It carries messages from your brain to your muscles and brings information back up!"
    },
    {
        system: "Brain & Senses",
        stem: "Why does food taste boring when you have a blocked nose?",
        options: ["Your tongue stops working", "Taste and smell work together", "Your saliva dries up", "Your throat swells shut"],
        k: 0,
        rationale: "Most of what we call 'taste' is actually smell! When your nose is blocked, the aroma of food can't reach your smell receptors, so flavours seem dull and flat."
    },
    {
        system: "Brain & Senses",
        stem: "What part of the brain at the back of your head helps you keep your balance?",
        options: ["Cerebrum", "Brainstem", "Cerebellum", "Amygdala"],
        k: 1,
        rationale: "The cerebellum fine-tunes all your movements and keeps you balanced. Without it you would wobble and stumble trying to walk in a straight line!"
    },
    {
        system: "Brain & Senses",
        stem: "Why do you blink your eyes without thinking about it?",
        options: ["To rest your eyeballs", "To spread tears and clean your eyes", "To focus on objects", "To let in more light"],
        k: 0,
        rationale: "You blink about 15-20 times a minute automatically! Each blink coats your eye with a fresh layer of tears that washes away dust and keeps your vision crystal clear."
    },
    {
        system: "Brain & Senses",
        stem: "What are the tiny nerve cells in your brain called?",
        options: ["Neurons", "Nephrons", "Platelets", "Alveoli"],
        k: 3,
        rationale: "You have billions of neurons in your brain! They send tiny electrical signals to each other at incredible speeds, creating every thought and feeling you have."
    },
    {
        system: "Brain & Senses",
        stem: "Which part of your brain is in charge of your feelings like happiness and fear?",
        options: ["Cerebrum", "Brainstem", "Cerebellum", "Amygdala"],
        k: 2,
        rationale: "The amygdala is a tiny almond-shaped cluster deep in your brain that acts as your emotional alarm system — responsible for making you feel happy, scared, or excited!"
    },
    {
        system: "Brain & Senses",
        stem: "How fast can nerve signals travel in your body?",
        options: ["As fast as a walking pace", "As fast as a bicycle", "As fast as a racing car", "At the speed of light"],
        k: 1,
        rationale: "The fastest nerve signals in your body travel at up to 270 miles per hour — faster than a racing car! That's how you react so quickly when something touches you."
    },
    {
        system: "Brain & Senses",
        stem: "What covers your entire body, protects you from germs, and keeps your insides safe?",
        options: ["Muscles", "Fat", "Skin", "Hair"],
        k: 1,
        rationale: "Your skin is actually the largest organ in your whole body! It's your personal waterproof armour, keeping germs out and moisture in."
    },
    {
        system: "Brain & Senses",
        stem: "When a doctor taps your knee and your leg kicks on its own, what is that called?",
        options: ["A habit", "A reflex", "A muscle cramp", "A nerve buzz"],
        k: 0,
        rationale: "A reflex is an automatic response your spinal cord sends out without waiting for your brain! It's your body's emergency fast-track system to protect you from harm."
    },
],
    highschool: [
    /* ---- SKELETAL SYSTEM (15) ---- */
    {
        system: "Skeletal System",
        stem: "What type of bone tissue has a spongy, lattice-like structure found inside large bones?",
        options: ["Compact bone", "Cartilage", "Cancellous (spongy) bone", "Periosteum"],
        k: 1,
        rationale: "Cancellous (spongy) bone has a honeycomb-like structure that makes bones lightweight yet strong. The spaces within it are filled with red bone marrow that produces blood cells."
    },
    {
        system: "Skeletal System",
        stem: "What is the periosteum?",
        options: ["The inner cavity of a bone", "A tough fibrous membrane covering the outer surface of bones", "The cartilage at bone ends", "The marrow inside bones"],
        k: 0,
        rationale: "The periosteum is a dense membrane that wraps around the outside of bones. It contains blood vessels, nerves, and bone-forming cells called osteoblasts that are vital for growth and repair."
    },
    {
        system: "Skeletal System",
        stem: "Which type of joint allows rotation only, such as turning your head from side to side?",
        options: ["Ball-and-socket joint", "Hinge joint", "Pivot joint", "Saddle joint"],
        k: 1,
        rationale: "A pivot joint allows one bone to rotate around another. The joint between the first two cervical vertebrae (atlas and axis) is a classic example, letting you shake your head 'no'."
    },
    {
        system: "Skeletal System",
        stem: "What is ossification?",
        options: ["The process of bone fracturing", "The process by which cartilage is gradually replaced by bone tissue", "The removal of calcium from bones", "The surgical repair of broken bones"],
        k: 0,
        rationale: "Ossification is how bones form and grow. Most of the skeleton starts as cartilage in a developing embryo, which is then slowly replaced by hard bone tissue through this process."
    },
    {
        system: "Skeletal System",
        stem: "Which cells are responsible for building and depositing new bone tissue?",
        options: ["Osteoclasts", "Osteoblasts", "Chondrocytes", "Osteocytes"],
        k: 0,
        rationale: "Osteoblasts are bone-building cells that secrete collagen and minerals to form new bone matrix. Once surrounded by matrix they become osteocytes, which maintain the existing bone."
    },
    {
        system: "Skeletal System",
        stem: "Which cells break down old bone tissue to allow continuous bone remodelling?",
        options: ["Osteoblasts", "Chondrocytes", "Osteoclasts", "Fibroblasts"],
        k: 1,
        rationale: "Osteoclasts are large cells that dissolve bone mineral and matrix. They work alongside osteoblasts in a constant cycle of resorption and deposition that keeps bones healthy and responsive."
    },
    {
        system: "Skeletal System",
        stem: "Which vitamin acts like a hormone to regulate calcium absorption and is critical for bone health?",
        options: ["Vitamin A", "Vitamin C", "Vitamin D", "Vitamin K"],
        k: 1,
        rationale: "Vitamin D is converted in the body into a hormone that promotes calcium absorption from the gut and its incorporation into bone. Deficiency in children causes rickets — soft, bowed bones."
    },
    {
        system: "Skeletal System",
        stem: "The vertebral column is divided into how many named regions?",
        options: ["Three", "Four", "Five", "Seven"],
        k: 1,
        rationale: "The spine has five regions: cervical (neck, 7 vertebrae), thoracic (mid-back, 12), lumbar (lower back, 5), sacral (fused, 5), and coccygeal (tailbone, 3-5 fused bones)."
    },
    {
        system: "Skeletal System",
        stem: "What is the correct anatomical term for freely movable joints such as the knee and shoulder?",
        options: ["Synarthroses", "Amphiarthroses", "Diarthroses", "Gomphoses"],
        k: 1,
        rationale: "Diarthroses (synovial joints) are freely movable joints lubricated by synovial fluid. Synarthroses are fixed joints like skull sutures, and amphiarthroses allow limited movement like the pubic symphysis."
    },
    {
        system: "Skeletal System",
        stem: "In adults, where is red bone marrow primarily found?",
        options: ["Inside the shaft of long bones", "In flat bones and the ends of long bones", "Only within the femur", "Exclusively within cartilage"],
        k: 0,
        rationale: "In adults, active red marrow producing blood cells is found mainly in flat bones like the sternum, pelvis, ribs, and skull, plus the epiphyses (ends) of some long bones."
    },
    {
        system: "Skeletal System",
        stem: "What tissue makes up the epiphyseal (growth) plate in developing bones?",
        options: ["Compact bone", "Hyaline cartilage", "Fibrocartilage", "Elastic cartilage"],
        k: 0,
        rationale: "Growth plates are made of hyaline cartilage. New cartilage cells are produced on one side while cartilage on the other side is replaced by bone, causing bones to lengthen during childhood."
    },
    {
        system: "Skeletal System",
        stem: "Which vitamin deficiency causes softening and weakening of bones in children, leading to bowed legs?",
        options: ["Vitamin A", "Vitamin C", "Vitamin K", "Vitamin D"],
        k: 2,
        rationale: "Rickets is caused by Vitamin D deficiency. Without enough Vitamin D, the intestines cannot absorb sufficient calcium, so bones fail to mineralise properly and become soft and deformed."
    },
    {
        system: "Skeletal System",
        stem: "The thoracic cage is formed by the ribs, thoracic vertebrae, and which other structure?",
        options: ["Clavicle", "Scapula", "Sternum", "Humerus"],
        k: 1,
        rationale: "The sternum (breastbone) forms the front wall of the thoracic cage. The ribs attach to it at the front and to the thoracic vertebrae at the back, forming a protective barrel around the heart and lungs."
    },
    {
        system: "Skeletal System",
        stem: "What type of cartilage makes up the intervertebral discs between vertebrae?",
        options: ["Hyaline cartilage", "Elastic cartilage", "Fibrocartilage", "Calcified cartilage"],
        k: 1,
        rationale: "Fibrocartilage is tough and highly resistant to compression, making it ideal for intervertebral discs that absorb the enormous forces placed on the spine during daily movement."
    },
    {
        system: "Skeletal System",
        stem: "How many pairs of ribs does the human body have in total?",
        options: ["10 pairs", "11 pairs", "12 pairs", "14 pairs"],
        k: 1,
        rationale: "Humans have 12 pairs of ribs. The top 7 pairs are 'true ribs' attached directly to the sternum. Pairs 8-10 are 'false ribs' and pairs 11-12 are 'floating ribs' with no front attachment."
    },

    /* ---- MUSCULAR SYSTEM (15) ---- */
    {
        system: "Muscular System",
        stem: "What is the basic functional contractile unit of a skeletal muscle fibre?",
        options: ["Myofibril", "Sarcomere", "Actin filament", "Motor unit"],
        k: 0,
        rationale: "The sarcomere is the fundamental unit of muscle contraction. It runs from one Z-line to the next and contains overlapping thick (myosin) and thin (actin) filaments that slide past each other during contraction."
    },
    {
        system: "Muscular System",
        stem: "According to the sliding filament theory, which two proteins interact to produce muscle contraction?",
        options: ["Collagen and elastin", "Myosin and actin", "Keratin and fibrin", "Tropomyosin and titin"],
        k: 0,
        rationale: "Myosin heads (thick filaments) repeatedly attach to actin (thin filaments), pivot, and pull them inward. This shortens the sarcomere and creates the pulling force of muscle contraction."
    },
    {
        system: "Muscular System",
        stem: "Which ion is released from the sarcoplasmic reticulum to trigger muscle contraction?",
        options: ["Sodium (Na+)", "Potassium (K+)", "Calcium (Ca2+)", "Magnesium (Mg2+)"],
        k: 1,
        rationale: "When a nerve impulse arrives, calcium floods out of the sarcoplasmic reticulum. It binds to troponin on the actin filament, which moves tropomyosin aside and exposes binding sites for myosin heads."
    },
    {
        system: "Muscular System",
        stem: "What is a motor unit?",
        options: ["A single muscle fibre", "A motor neuron and all the muscle fibres it controls", "The sarcomere within a myofibril", "The neuromuscular junction alone"],
        k: 0,
        rationale: "When one motor neuron fires, all the muscle fibres it connects to contract simultaneously — this is the motor unit. Precise movements use small motor units; powerful movements recruit large ones."
    },
    {
        system: "Muscular System",
        stem: "What primarily causes muscle fatigue during intense exercise?",
        options: ["Complete oxygen depletion in the blood", "Depletion of ATP and accumulation of metabolic byproducts", "Muscle fibres dying permanently", "Tendons stretching beyond their limit"],
        k: 0,
        rationale: "Fatigue results from reduced ATP availability, accumulation of inorganic phosphate, hydrogen ions (lowering pH), and other metabolic waste products that interfere with the contractile mechanism."
    },
    {
        system: "Muscular System",
        stem: "Which type of contraction occurs when a muscle generates tension but does not change in length?",
        options: ["Isotonic concentric", "Isotonic eccentric", "Isometric", "Isokinetic"],
        k: 1,
        rationale: "An isometric contraction produces force without joint movement — like pushing against a wall. Isotonic contractions involve movement: concentric shortens the muscle, eccentric lengthens it under load."
    },
    {
        system: "Muscular System",
        stem: "What is the neuromuscular junction?",
        options: ["The point where two muscles attach to each other", "The site where a motor neuron communicates with a muscle fibre", "The tendon insertion point on bone", "The Z-line boundary of a sarcomere"],
        k: 0,
        rationale: "The neuromuscular junction is a specialised synapse between a motor neuron terminal and a muscle fibre. Neurotransmitters released here trigger the electrical signal that starts contraction."
    },
    {
        system: "Muscular System",
        stem: "Which neurotransmitter is released at the neuromuscular junction to initiate muscle contraction?",
        options: ["Dopamine", "Serotonin", "Acetylcholine", "Norepinephrine"],
        k: 1,
        rationale: "Acetylcholine (ACh) is released from the motor neuron terminal into the synaptic cleft. It binds to receptors on the muscle membrane, generating an action potential that triggers contraction."
    },
    {
        system: "Muscular System",
        stem: "What is DOMS (Delayed Onset Muscle Soreness)?",
        options: ["A chronic muscle wasting disease", "Pain and stiffness felt 24-72 hours after unfamiliar exercise due to microscopic muscle damage and inflammation", "Immediate cramping experienced during peak exercise", "Permanent muscle inflammation requiring medical treatment"],
        k: 0,
        rationale: "DOMS is caused by microscopic tears in muscle fibres and connective tissue following eccentric exercise or unaccustomed training. The resulting inflammation and repair process causes the familiar ache."
    },
    {
        system: "Muscular System",
        stem: "Slow-twitch (Type I) muscle fibres are best suited for which type of activity?",
        options: ["Explosive short-distance sprinting", "Heavy one-rep maximum weightlifting", "Long-duration endurance activities like marathon running", "Quick reflex-based actions"],
        k: 1,
        rationale: "Type I fibres are rich in mitochondria and myoglobin, have excellent blood supply, and are highly fatigue-resistant. They rely on aerobic metabolism, making them perfect for sustained endurance activities."
    },
    {
        system: "Muscular System",
        stem: "Fast-twitch (Type II) muscle fibres are primarily characterised by which feature?",
        options: ["High endurance and extreme fatigue resistance", "Slow contraction speed suitable for posture", "High myoglobin content giving them a red colour", "Rapid, powerful contractions with relatively quick fatigability"],
        k: 2,
        rationale: "Type II fibres contract quickly and powerfully using anaerobic glycolysis for rapid ATP production. However, they fatigue quickly because they generate lactic acid and have fewer mitochondria."
    },
    {
        system: "Muscular System",
        stem: "What is the 'origin' of a skeletal muscle?",
        options: ["The attachment point on the bone that moves", "The stationary attachment point on the fixed bone", "Where a muscle belly splits into two heads", "The point where muscle tissue transitions into tendon"],
        k: 0,
        rationale: "The origin is where a muscle attaches to the relatively fixed bone. The insertion is on the bone that moves. When the muscle contracts, the insertion moves toward the origin."
    },
    {
        system: "Muscular System",
        stem: "What is muscular hypertrophy?",
        options: ["Muscle wasting due to prolonged inactivity", "An increase in the cross-sectional size of individual muscle fibres from resistance training", "The development of entirely new muscle fibres", "Chronic muscle inflammation following injury"],
        k: 0,
        rationale: "Hypertrophy is an increase in muscle fibre diameter. Resistance training causes micro-damage, and repair adds more myofibrils and contractile protein, making each fibre thicker and the whole muscle larger."
    },
    {
        system: "Muscular System",
        stem: "Which energy system provides immediate fuel for the first few seconds of maximal explosive effort?",
                options: ["Aerobic oxidative system", "Anaerobic glycolytic system", "Phosphocreatine (ATP-PC) system", "Fat oxidation system"],
        k: 1,
        rationale: "The ATP-PC system uses stored ATP and phosphocreatine to regenerate ATP almost instantly. It powers maximum efforts like jumping or sprinting for roughly 8-10 seconds before other systems must take over."
    },
    {
        system: "Muscular System",
        stem: "What is the primary role of the sarcoplasmic reticulum in muscle cells?",
        options: ["To produce ATP needed for contraction", "To store and release calcium ions that initiate contraction", "To synthesise structural muscle proteins", "To conduct the electrical action potential along the fibre"],
        k: 0,
        rationale: "The sarcoplasmic reticulum is a specialised endoplasmic reticulum that wraps around myofibrils. It stores calcium at rest and releases it upon stimulation, which is the trigger for the contraction cycle."
    },

    /* ---- HEART & LUNGS (15) ---- */
    {
        system: "Heart & Lungs",
        stem: "What is cardiac output?",
        options: ["The pressure of blood within the arteries", "The volume of blood the heart pumps out per minute", "The rate of oxygen exchange across alveoli", "The electrical activity pattern of the heart"],
        k: 0,
        rationale: "Cardiac output = heart rate × stroke volume. At rest it is about 5 litres per minute. During intense exercise it can rise to 20-25 litres per minute in trained athletes."
    },
    {
        system: "Heart & Lungs",
        stem: "What is the sinoatrial (SA) node?",
        options: ["A valve preventing backflow between the atria and ventricles", "The heart's natural pacemaker that initiates each electrical heartbeat", "A blood vessel that supplies the heart muscle with oxygen", "The outermost protective layer of the heart wall"],
        k: 0,
        rationale: "The SA node is a cluster of specialised cells in the right atrium that spontaneously generates electrical impulses about 60-100 times per minute, setting the heart's natural rhythm."
    },
    {
        system: "Heart & Lungs",
        stem: "Which blood vessels supply the heart muscle itself with oxygenated blood?",
        options: ["Pulmonary arteries", "Aortic arch branches", "Coronary arteries", "Jugular veins"],
        k: 1,
        rationale: "The coronary arteries branch from the base of the aorta and supply the heart muscle (myocardium). Blockage of these arteries causes a heart attack (myocardial infarction)."
    },
    {
        system: "Heart & Lungs",
        stem: "What does systolic blood pressure measure?",
        options: ["The arterial pressure when the heart muscle is relaxed", "The mathematical average of systolic and diastolic pressures", "The arterial pressure generated when the heart contracts and ejects blood", "The pressure within the pulmonary circulation"],
        k: 1,
        rationale: "Systolic pressure is the peak arterial pressure reached during ventricular contraction. Diastolic is the lower pressure during relaxation. A normal reading is around 120/80 mmHg."
    },
    {
        system: "Heart & Lungs",
        stem: "What is the function of the bicuspid (mitral) valve?",
        options: ["Prevents backflow from the aorta into the left ventricle", "Prevents backflow from the left ventricle into the left atrium", "Prevents backflow from the pulmonary artery into the right ventricle", "Prevents backflow from the right ventricle into the right atrium"],
        k: 0,
        rationale: "The bicuspid (mitral) valve sits between the left atrium and left ventricle. It snaps shut when the ventricle contracts, preventing oxygenated blood from flowing backwards toward the lungs."
    },
    {
        system: "Heart & Lungs",
        stem: "During gas exchange in the alveoli, oxygen moves from air into the blood by which process?",
        options: ["Active transport requiring ATP", "Osmosis driven by water pressure", "Diffusion down a concentration gradient", "Filtration driven by blood pressure"],
        k: 1,
        rationale: "Oxygen diffuses passively from areas of high concentration in the alveolar air into the surrounding capillary blood where concentration is lower. No energy is required — it follows its own gradient."
    },
    {
        system: "Heart & Lungs",
        stem: "What is tidal volume?",
        options: ["The maximum total capacity of both lungs combined", "The volume of air remaining after a maximum forced exhalation", "The volume of air inhaled or exhaled during one normal resting breath", "The maximum volume of air forcefully exhaled after a deep breath"],
        k: 1,
        rationale: "Tidal volume at rest is approximately 500 mL per breath. It increases significantly during exercise as the body demands more oxygen and needs to expel more carbon dioxide."
    },
    {
        system: "Heart & Lungs",
        stem: "What is the role of pulmonary surfactant?",
        options: ["To kill bacteria that enter the airways", "To transport oxygen molecules within alveolar fluid", "To reduce surface tension inside alveoli, preventing them from collapsing", "To warm and humidify air entering the lungs"],
        k: 1,
        rationale: "Surfactant is produced by Type II alveolar cells. Without it, the surface tension of the water lining alveoli would cause them to collapse with each exhalation — a condition seen in premature infants."
    },
    {
        system: "Heart & Lungs",
        stem: "Adult haemoglobin is made up of how many polypeptide chains?",
        options: ["Two", "Three", "Four", "Six"],
        k: 1,
        rationale: "Adult haemoglobin (HbA) consists of four polypeptide chains — two alpha and two beta. Each chain carries one haem group containing an iron atom that can bind one oxygen molecule, giving four O2 per haemoglobin."
    },
    {
        system: "Heart & Lungs",
        stem: "What is the Bohr effect?",
        options: ["The increase in heart rate in response to aerobic exercise", "The rightward shift of the oxygen-haemoglobin dissociation curve caused by increased CO2 and lower pH", "The age-related decline in lung capacity", "The reflex control of breathing rate by CO2 chemoreceptors"],
        k: 0,
        rationale: "The Bohr effect means haemoglobin releases oxygen more readily in tissues with high CO2 and low pH (like active muscles). This perfectly matches oxygen delivery to where it is needed most."
    },
    {
        system: "Heart & Lungs",
        stem: "Which brain region contains the respiratory centres that automatically control breathing rhythm?",
        options: ["Cerebral cortex", "Cerebellum", "Medulla oblongata", "Hypothalamus"],
        k: 1,
        rationale: "The medulla oblongata houses the dorsal and ventral respiratory groups that set the basic breathing rhythm. The pons fine-tunes it. CO2 levels in the blood are the primary driver of breathing rate."
    },
    {
        system: "Heart & Lungs",
        stem: "What is a normal resting heart rate range for a healthy adult?",
        options: ["40-50 bpm", "60-100 bpm", "100-120 bpm", "120-140 bpm"],
        k: 0,
        rationale: "60-100 beats per minute is the normal resting range. Highly trained endurance athletes often have resting rates of 40-50 bpm because their stronger hearts pump more blood per beat."
    },
    {
        system: "Heart & Lungs",
        stem: "What is erythropoiesis?",
        options: ["The destruction and recycling of old red blood cells", "The production of new red blood cells in the bone marrow", "The clotting cascade at a wound site", "The binding of oxygen to haemoglobin in the lungs"],
        k: 0,
        rationale: "Erythropoiesis occurs mainly in red bone marrow and is stimulated by the hormone erythropoietin (EPO) released by the kidneys when blood oxygen levels fall — for example at high altitude."
    },
    {
        system: "Heart & Lungs",
        stem: "What structure separates the left and right sides of the heart?",
        options: ["The pericardium", "The pleura", "The septum", "The myocardium"],
        k: 1,
        rationale: "The septum is a thick muscular wall dividing the heart into right and left halves. This separation ensures oxygenated and deoxygenated blood never mix during normal circulation."
    },
    {
        system: "Heart & Lungs",
        stem: "What is the name of the large vein that returns deoxygenated blood from the lower body to the right atrium?",
        options: ["Superior vena cava", "Pulmonary vein", "Inferior vena cava", "Coronary sinus"],
        k: 1,
        rationale: "The inferior vena cava drains blood from the lower body, while the superior vena cava drains the upper body and head. Both empty into the right atrium. Pulmonary veins, unusually, carry oxygenated blood."
    },
            /* ---- DIGESTION (15) ---- */
    {
        system: "Digestion",
        stem: "What is the chemical name for the acid produced by the stomach?",
        options: ["Sulfuric acid", "Hydrochloric acid", "Citric acid", "Carbonic acid"],
        k: 0,
        rationale: "Gastric glands secrete hydrochloric acid (HCl), creating a stomach pH of 1.5-3.5. This denatures proteins, activates pepsinogen into pepsin, and kills most ingested bacteria."
    },
    {
        system: "Digestion",
        stem: "Which enzyme found in saliva begins the chemical digestion of carbohydrates in the mouth?",
        options: ["Pepsin", "Lipase", "Salivary amylase", "Trypsin"],
        k: 1,
        rationale: "Salivary amylase begins breaking starch (polysaccharides) into smaller maltose units in the mouth. This is why starchy food like bread tastes slightly sweet if you chew it for a long time."
    },
    {
        system: "Digestion",
        stem: "Which specialised cells in the stomach lining secrete hydrochloric acid?",
        options: ["Chief cells", "Parietal cells", "Goblet cells", "G cells"],
        k: 0,
        rationale: "Parietal cells (oxyntic cells) in the gastric glands secrete both HCl and intrinsic factor. Chief cells secrete pepsinogen, and G cells produce the hormone gastrin which stimulates acid secretion."
    },
    {
        system: "Digestion",
        stem: "What is the primary role of pepsin in digestion?",
        options: ["Breaks down carbohydrates in the stomach", "Breaks down proteins into smaller peptide fragments in the stomach", "Emulsifies fat droplets in the small intestine", "Neutralises stomach acid as it enters the duodenum"],
        k: 0,
        rationale: "Pepsin is a protease enzyme active in the acidic environment of the stomach. It is secreted as inactive pepsinogen by chief cells and activated by HCl, preventing it from digesting the stomach itself."
    },
    {
        system: "Digestion",
        stem: "What is enterohepatic circulation?",
        options: ["Portal blood flow from intestines to the liver", "The recycling of bile salts between the liver, bile ducts, small intestine, and back to the liver", "The arterial blood supply to the entire GI tract", "The nerve supply from the enteric nervous system to the intestines"],
        k: 0,
        rationale: "About 95% of bile salts secreted into the small intestine are reabsorbed in the terminal ileum and returned to the liver for reuse. This highly efficient recycling means the body needs to synthesise little new bile."
    },
    {
        system: "Digestion",
        stem: "Which hormone triggers the gallbladder to contract and release bile into the small intestine?",
        options: ["Gastrin", "Secretin", "Cholecystokinin (CCK)", "Insulin"],
        k: 1,
        rationale: "CCK is released by cells in the duodenal wall in response to fat and protein. It stimulates gallbladder contraction, relaxes the sphincter of Oddi, and also triggers pancreatic enzyme secretion."
    },
    {
        system: "Digestion",
        stem: "What is the brush border of the small intestine?",
        options: ["A protective mucus layer coating the intestinal wall", "Densely packed microvilli on enterocyte surfaces that enormously increase the absorptive surface area", "The smooth muscle layer responsible for peristaltic contractions", "A layer of mucus-secreting goblet cells lining the intestinal wall"],
        k: 0,
        rationale: "Each epithelial cell (enterocyte) has around 3,000 microvilli on its apical surface forming the brush border. This increases the total absorptive surface of the small intestine to approximately the size of a tennis court."
    },
    {
        system: "Digestion",
        stem: "Where are fat-soluble vitamins (A, D, E, K) primarily absorbed in the digestive tract?",
        options: ["In the stomach with gastric acid", "In the large intestine by bacterial action", "In the small intestine with the aid of bile salts and micelles", "In the mouth through the buccal mucosa"],
        k: 1,
        rationale: "Fat-soluble vitamins are packaged into micelles (tiny fat-bile complexes) in the small intestine and absorbed through the intestinal wall into lymphatic vessels (lacteals) rather than directly into blood."
    },
    {
        system: "Digestion",
        stem: "What is the function of the ileocecal valve?",
        options: ["Controls the rate of chyme release from the stomach into the duodenum", "Prevents backflow of large intestine contents into the small intestine", "Regulates the release of bile into the duodenum", "Separates the jejunum from the ileum"],
        k: 0,
        rationale: "The ileocecal valve sits at the junction of the small and large intestines. It acts as a one-way gate preventing bacteria-rich colonic contents from contaminating the small intestine."
    },
    {
        system: "Digestion",
        stem: "Which macronutrient begins chemical digestion first — in the mouth?",
        options: ["Proteins", "Fats", "Carbohydrates", "Vitamins and minerals"],
        k: 1,
        rationale: "Salivary amylase immediately begins breaking down starch molecules as soon as food enters the mouth. Protein digestion starts in the stomach, and fat digestion mainly occurs in the small intestine."
    },
    {
        system: "Digestion",
        stem: "What is the hepatic portal system?",
        options: ["The bile duct network draining from liver to intestine", "The network of veins carrying nutrient-rich blood from the intestines directly to the liver for processing", "The arterial supply bringing oxygenated blood to the liver", "The lymphatic vessels draining absorbed fats from the gut"],
        k: 0,
        rationale: "After absorption, nutrients pass into the hepatic portal vein and travel to the liver first. The liver can store, transform, detoxify, or redistribute them before they reach general circulation."
    },
    {
        system: "Digestion",
        stem: "What causes acid reflux (heartburn)?",
        options: ["Excess bile flooding back into the stomach", "Gastric acid rising into the oesophagus due to a weakened lower oesophageal sphincter", "Spasm of the pyloric sphincter trapping acid", "Bacterial infection of the stomach lining"],
        k: 0,
        rationale: "The lower oesophageal sphincter normally prevents stomach contents from rising. When it is weak or relaxes inappropriately, acidic chyme enters the oesophagus, causing the burning sensation of heartburn."
    },
    {
        system: "Digestion",
        stem: "What is the primary site of dietary iron absorption in the gastrointestinal tract?",
        options: ["Stomach", "Duodenum and upper jejunum", "Ileum", "Large intestine"],
        k: 0,
        rationale: "Iron is mainly absorbed in the duodenum and proximal jejunum. Vitamin C enhances absorption by keeping iron in its more absorbable ferrous (Fe2+) form. Deficiency causes iron-deficiency anaemia."
    },
    {
        system: "Digestion",
        stem: "Which intestinal cells are primarily responsible for absorbing digested nutrients?",
        options: ["Goblet cells", "Enterocytes", "Paneth cells", "Enteroendocrine cells"],
        k: 0,
        rationale: "Enterocytes are the absorptive epithelial cells lining the small intestinal villi. They transport amino acids, monosaccharides, fatty acids, vitamins, and minerals into blood or lymph."
    },
    {
        system: "Digestion",
        stem: "What is the role of intrinsic factor, produced by parietal cells of the stomach?",
        options: ["It converts pepsinogen into active pepsin", "It neutralises acid as it enters the duodenum", "It is essential for the absorption of vitamin B12 in the terminal ileum", "It stimulates bile production in the liver"],
        k: 1,
        rationale: "Intrinsic factor is a glycoprotein that binds vitamin B12 (cobalamin) in the stomach and escorts it to the terminal ileum where it can be absorbed. Without intrinsic factor, B12 deficiency and pernicious anaemia result."
    },

    /* ---- BRAIN & SENSES (15) ---- */
    {
        system: "Brain & Senses",
        stem: "What are the three protective membranes that enclose the brain and spinal cord collectively called?",
        options: ["Pleura", "Peritoneum", "Meninges", "Pericardium"],
        k: 1,
        rationale: "The three meningeal layers from outside to inside are: dura mater (tough), arachnoid mater (web-like), and pia mater (thin, directly touching the brain). Meningitis is inflammation of these membranes."
    },
    {
        system: "Brain & Senses",
        stem: "What is the primary function of the myelin sheath surrounding nerve axons?",
        options: ["To supply glucose and nutrients directly to the nerve cell body", "To link adjacent neurons across synaptic gaps", "To electrically insulate the axon and dramatically speed up nerve impulse conduction", "To produce and store neurotransmitters for release"],
        k: 1,
        rationale: "Myelin allows saltatory conduction — the impulse leaps between gaps in myelin (nodes of Ranvier) rather than travelling continuously. This increases conduction speed from about 1 m/s to up to 120 m/s."
    },
    {
        system: "Brain & Senses",
        stem: "What is the typical resting membrane potential of a neuron?",
        options: ["+70 mV", "0 mV", "-70 mV", "-140 mV"],
        k: 1,
        rationale: "At rest, the inside of a neuron is about -70 mV relative to the outside, maintained by the sodium-potassium pump. Depolarisation to threshold (-55 mV) triggers an action potential."
    },
    {
        system: "Brain & Senses",
        stem: "What occurs during a nerve action potential?",
        options: ["Calcium ions flow into the cell triggering neurotransmitter release at the dendrites", "Sodium ions rapidly enter the cell causing depolarisation, followed by potassium exiting to repolarise the membrane", "Dopamine is released into the synapse causing the next neuron to fire", "The myelin sheath contracts to physically squeeze the signal along"],
        k: 0,
        rationale: "An action potential is an all-or-nothing electrical event. Voltage-gated Na+ channels open (depolarisation), then K+ channels open (repolarisation), briefly overshooting to hyperpolarisation before returning to rest."
    },
    {
        system: "Brain & Senses",
        stem: "Which cerebral lobe is primarily responsible for processing touch sensation and spatial awareness?",
        options: ["Frontal lobe", "Occipital lobe", "Temporal lobe", "Parietal lobe"],
        k: 2,
        rationale: "The parietal lobe contains the primary somatosensory cortex which maps touch, temperature, and pain from the body. It also integrates spatial information to help you know where your body parts are."
    },
    {
        system: "Brain & Senses",
        stem: "What is the primary role of the hypothalamus?",
        options: ["Direct voluntary control of skeletal muscle movement", "Processing and relaying visual information to the cortex", "Regulating homeostasis including body temperature, hunger, thirst, and circadian rhythms", "Forming and consolidating long-term explicit memories"],
        k: 1,
        rationale: "The hypothalamus is the master regulator of homeostasis. It controls the autonomic nervous system and pituitary gland, coordinating responses to temperature, hydration, hunger, stress, and sleep cycles."
    },
    {
        system: "Brain & Senses",
        stem: "What is the corpus callosum?",
        options: ["The folded outer layer of the cerebral hemispheres", "A massive band of white matter fibres connecting the left and right cerebral hemispheres", "The floor of the third and fourth brain ventricles", "The fibrous periosteum covering the exterior of the skull"],
        k: 0,
        rationale: "The corpus callosum is the largest white matter structure in the brain, containing about 200-250 million nerve fibres. It allows rapid communication and coordination between the two cerebral hemispheres."
    },
    {
        system: "Brain & Senses",
        stem: "Which neurotransmitter is most associated with the brain's reward, motivation, and pleasure circuits?",
        options: ["Acetylcholine", "Serotonin", "Dopamine", "GABA"],
        k: 1,
        rationale: "Dopamine is released in the mesolimbic pathway (reward circuit) in response to rewarding stimuli. Disruption of dopamine signalling is implicated in addiction, Parkinson's disease, and schizophrenia."
    },
    {
        system: "Brain & Senses",
        stem: "What is the blood-brain barrier?",
        options: ["The dura mater layer that mechanically shields the brain", "A highly selective barrier formed by specialised capillary endothelial cells that tightly regulates what enters the brain", "The cerebrospinal fluid cushion surrounding brain tissue", "The bony cranium protecting the brain from physical trauma"],
        k: 0,
        rationale: "The blood-brain barrier consists of tightly joined endothelial cells with no gaps. It permits oxygen, glucose, and some drugs to pass while blocking toxins, pathogens, and most large molecules from reaching neural tissue."
    },
    {
        system: "Brain & Senses",
        stem: "Which photoreceptor cells in the retina are specialised for detecting dim light and enabling night vision?",
        options: ["Cone cells", "Rod cells", "Ganglion cells", "Bipolar cells"],
        k: 0,
        rationale: "Rods are extremely light-sensitive and contain rhodopsin. There are about 120 million rods concentrated in the peripheral retina. They only detect light intensity, not colour, which is why night vision is greyscale."
    },
    {
        system: "Brain & Senses",
        stem: "What is the function of the semicircular canals in the inner ear?",
        options: ["Converting sound vibrations into nerve impulses for hearing", "Detecting rotational head movements to help maintain balance and spatial orientation", "Amplifying sound waves before they reach the cochlea", "Equalising air pressure between the inner and outer ear"],
        k: 0,
        rationale: "The three semicircular canals are arranged in perpendicular planes to detect rotation in any direction. Fluid movement within them bends hair cells, signalling rotational acceleration to the brain."
    },
    {
        system: "Brain & Senses",
        stem: "Which structure converts mechanical sound vibrations into electrical nerve impulses sent to the brain?",
        options: ["Semicircular canals", "Eardrum (tympanic membrane)", "Cochlea", "Ossicles (tiny ear bones)"],
        k: 1,
        rationale: "The cochlea is a fluid-filled, snail-shaped structure lined with thousands of hair cells that respond to different sound frequencies. Bending of these hairs generates electrical signals sent via the auditory nerve."
    },
    {
        system: "Brain & Senses",
        stem: "What does the autonomic nervous system primarily regulate?",
        options: ["Voluntary control of all skeletal muscles", "Conscious sensory processing in the cerebral cortex", "Involuntary body functions such as heart rate, digestion, glandular secretion, and smooth muscle activity", "Fine motor coordination and balance through the cerebellum"],
        k: 1,
        rationale: "The autonomic nervous system has two divisions: sympathetic (fight-or-flight) and parasympathetic (rest-and-digest). They act in opposition to regulate heart rate, breathing, digestion, and blood pressure automatically."
    },
    {
        system: "Brain & Senses",
        stem: "Which neurotransmitter is the brain's primary inhibitory signal, acting as a neural 'brake' to calm activity?",
        options: ["Glutamate", "Acetylcholine", "Norepinephrine", "GABA (gamma-aminobutyric acid)"],
        k: 2,
        rationale: "GABA is the main inhibitory neurotransmitter in the brain. It hyperpolarises neurons, making them less likely to fire. Many anxiolytic drugs like benzodiazepines work by enhancing GABA's inhibitory effects."
    },
    {
        system: "Brain & Senses",
        stem: "What is neuroplasticity?",
        options: ["The physical elasticity and flexibility of brain tissue itself", "The brain's ability to reorganise and form new neural connections in response to learning, experience, or injury throughout life", "The protective myelin coating that insulates neuron axons", "The natural process of neuronal cell death that accelerates with ageing"],
        k: 0,
        rationale: "Neuroplasticity underlies all learning and memory. When you practise a skill, synaptic connections strengthen (long-term potentiation). After brain injury, plasticity allows other regions to partially compensate for lost function."
    },
],
           advanced: [
    /* ---- SKELETAL SYSTEM (15) ---- */
    {
        system: "Skeletal System",
        stem: "Which signalling pathway primarily regulates osteoblast differentiation from mesenchymal stem cells?",
        options: ["Wnt/β-catenin signalling pathway", "JAK-STAT signalling pathway", "cAMP-PKA signalling pathway", "Hedgehog signalling pathway"],
        k: 3,
        rationale: "The Wnt/β-catenin pathway is a master regulator of osteoblastogenesis. When Wnt ligands bind their receptors, β-catenin accumulates and translocates to the nucleus to activate osteoblast-specific transcription factors like Runx2."
    },
    {
        system: "Skeletal System",
        stem: "What is RANKL and what role does it play in bone remodelling?",
        options: ["A calcium-binding protein secreted by osteoblasts that inhibits osteoclast formation", "A cytokine produced by osteoblasts and stromal cells that binds RANK on osteoclast precursors to stimulate osteoclastogenesis", "A hormone secreted by the parathyroid gland that activates bone-forming osteoblasts", "An enzyme secreted by osteoclasts that directly dissolves hydroxyapatite crystals in bone matrix"],
        k: 0,
        rationale: "RANKL (Receptor Activator of Nuclear factor Kappa-B Ligand) is expressed on osteoblasts and stromal cells. It binds RANK on osteoclast precursors, promoting their differentiation and activation. Osteoprotegerin (OPG) acts as a decoy receptor, competitively inhibiting RANKL and thus suppressing bone resorption."
    },
    {
        system: "Skeletal System",
        stem: "Parathyroid hormone (PTH) has paradoxical effects on bone depending on administration pattern. What is the explanation for this?",
        options: ["Continuous PTH exposure activates osteoblasts while intermittent exposure activates osteoclasts exclusively", "Intermittent PTH preferentially stimulates osteoblast activity and bone formation, while continuous elevated PTH drives osteoclast-mediated bone resorption via RANKL upregulation", "PTH directly deposits calcium into bone matrix in pulses but leaches it continuously", "The paradox is explained entirely by PTH receptor desensitisation regardless of exposure pattern"],
        k: 0,
        rationale: "This PTH paradox has major clinical relevance: intermittent subcutaneous teriparatide (PTH 1-34) is used anabolically to treat severe osteoporosis, while chronically elevated endogenous PTH (hyperparathyroidism) causes bone loss through sustained osteoclast stimulation."
    },
    {
        system: "Skeletal System",
        stem: "What is the composition of the organic matrix of bone, and which protein predominates?",
        options: ["Primarily elastin (90%) with collagen type II and proteoglycans making up the remainder", "Approximately 90% type I collagen with the remainder being non-collagenous proteins such as osteocalcin, osteopontin, and bone sialoprotein", "Equal proportions of collagen types I, II, and III with hydroxyapatite crystals embedded throughout", "Primarily fibronectin and laminin providing a scaffold for subsequent mineralisation"],
        k: 0,
        rationale: "Type I collagen fibres provide the tensile scaffold of bone. Non-collagenous proteins like osteocalcin (a marker of bone formation) regulate mineralisation. Hydroxyapatite [Ca10(PO4)6(OH)2] crystals embed in this organic matrix to provide compressive strength."
    },
    {
        system: "Skeletal System",
        stem: "In the context of fracture healing, what distinguishes primary (direct) bone healing from secondary (indirect) bone healing?",
        options: ["Primary healing involves callus formation and is seen in stable fractures with small gaps; secondary healing requires rigid fixation with no gap", "Primary healing occurs only in cancellous bone; secondary healing is restricted to cortical bone regardless of fixation", "Primary healing requires direct contact or minimal gap with rigid fixation and no callus; secondary healing proceeds through haematoma, soft callus, hard callus, and remodelling stages", "Primary healing is faster in all scenarios and is always preferred clinically over secondary healing"],
        k: 1,
        rationale: "Secondary (indirect) healing is the natural process: haematoma → fibrocartilaginous callus → bony callus → remodelling. Primary healing requires absolute rigid internal fixation with precise anatomical reduction, allowing direct osteonal remodelling across the fracture without a callus."
    },
    {
        system: "Skeletal System",
        stem: "Which transcription factor is considered the master regulator of osteoblast differentiation?",
        options: ["MyoD", "PPAR-γ", "Runx2 (Cbfa1)", "Sox9"],
        k: 1,
        rationale: "Runx2 (Runt-related transcription factor 2) is the essential osteoblast master regulator. Runx2 knockout mice completely lack bone formation. Heterozygous Runx2 mutations in humans cause cleidocranial dysplasia."
    },
    {
        system: "Skeletal System",
        stem: "What is the histological appearance of a Haversian system (osteon) in compact bone?",
        options: ["Disorganised woven bone trabeculae surrounding multiple central vascular canals in a random lattice pattern", "Concentric lamellae of mineralised bone matrix surrounding a central canal containing blood vessels and nerves, with osteocytes in lacunae connected by canaliculi", "Parallel columns of osteoblasts depositing successive mineralised layers without any central vascular structure", "Sheets of type II collagen with embedded chondrocytes arranged in a columnar growth pattern"],
        k: 0,
        rationale: "Osteons are the structural units of compact bone. Perforating (Volkmann's) canals run perpendicularly to connect Haversian canals. Osteocytes in lacunae communicate via gap junctions through canaliculi, enabling mechanosensation and coordinated remodelling."
    },
    {
        system: "Skeletal System",
        stem: "How does sclerostin (SOST gene product) regulate bone formation?",
        options: ["It stimulates osteoclast differentiation by upregulating RANKL expression on stromal cells", "It is secreted by osteocytes and inhibits the Wnt pathway by binding LRP5/6 co-receptors, thereby suppressing osteoblast activity", "It directly mineralises osteoid by acting as a nucleation site for hydroxyapatite crystal deposition", "It activates BMP signalling to drive mesenchymal stem cell commitment to the osteoblast lineage"],
        k: 0,
        rationale: "Sclerostin is produced by osteocytes under mechanical unloading. It antagonises Wnt signalling by blocking LRP5/6, reducing osteoblast activity. Anti-sclerostin antibodies (romosozumab) are approved anabolic osteoporosis treatments that exploit this pathway."
    },
    {
        system: "Skeletal System",
        stem: "What is the molecular basis of the triple helix structure of collagen?",
        options: ["Three identical α-chains stabilised by disulfide bonds between cysteine residues at regular intervals", "Three polypeptide chains each with a repeating Gly-X-Y motif wound into a right-handed superhelix stabilised by interchain hydrogen bonds, with glycine at every third position essential because it is the only residue small enough to fit the interior", "A single polypeptide chain that folds back on itself three times stabilised by hydrophobic interactions in the core", "Three β-sheet domains crosslinked by lysyl oxidase-mediated covalent bonds prior to secretion"],
        k: 0,
        rationale: "The Gly-X-Y repeat is critical — Gly at position 3n occupies the sterically restricted central axis. X is often proline (hydroxylated to hydroxyproline by vitamin C-dependent prolyl hydroxylase). Osteogenesis imperfecta often results from Gly substitution mutations disrupting this structure."
    },
    {
        system: "Skeletal System",
        stem: "What is the significance of the epiphyseal growth plate zone of hypertrophy in endochondral ossification?",
        options: ["It is the proliferating zone where chondrocytes actively divide to lengthen the cartilage template", "It is where chondrocytes enlarge (hypertrophy), begin secreting type X collagen and VEGF, attract vascular invasion, and undergo apoptosis — creating the scaffold for primary ossification", "It is the resting zone where quiescent chondrocytes act as stem cells for subsequent proliferation", "It is where osteoblasts first differentiate and begin depositing primary woven bone on the cartilage template"],
        k: 0,
        rationale: "Hypertrophic chondrocytes are critical orchestrators. Their VEGF secretion drives angiogenesis. Type X collagen facilitates calcification. Their apoptosis leaves calcified cartilage spicules onto which osteoblasts deposit woven bone, creating the primary spongiosa."
    },
    {
        system: "Skeletal System",
        stem: "Duchenne Muscular Dystrophy profoundly affects bone health. What is the primary molecular defect?",
        options: ["Mutations in the COL1A1 gene encoding type I collagen, causing structurally weak bones", "Loss-of-function mutations in the dystrophin gene causing absence of the dystrophin-glycoprotein complex from the sarcolemma", "Gain-of-function mutations in the myostatin gene causing excessive muscle growth and secondary bone compression", "Mutations in the titin gene causing sarcomere instability and progressive myofibrillar disintegration"],
        k: 0,
        rationale: "Dystrophin connects the intracellular actin cytoskeleton to the extracellular matrix via the dystrophin-glycoprotein complex. Its absence causes membrane fragility, repeated contraction-induced injury, inflammation, and progressive muscle fibre replacement by fat and fibrosis."
    },
    {
        system: "Skeletal System",
        stem: "What is the mechanism by which bisphosphonates treat osteoporosis?",
        options: ["They stimulate osteoblast differentiation by activating the Wnt/β-catenin signalling pathway", "They are incorporated into bone matrix and ingested by osteoclasts during resorption, where they inhibit farnesyl pyrophosphate synthase in the mevalonate pathway, causing osteoclast apoptosis", "They competitively inhibit RANKL binding to its receptor on osteoclast precursors, preventing their differentiation", "They increase intestinal calcium absorption by acting as vitamin D receptor agonists"],
        k: 0,
        rationale: "Nitrogen-containing bisphosphonates (alendronate, zoledronate) inhibit farnesyl pyrophosphate synthase, disrupting prenylation of GTPases (Ras, Rho, Rac) essential for osteoclast cytoskeletal function and survival, ultimately inducing osteoclast apoptosis."
    },
    {
        system: "Skeletal System",
        stem: "What is the role of fibroblast growth factor 23 (FGF23) in mineral metabolism?",
        options: ["It is produced by bone (osteocytes) and acts on the kidney to reduce phosphate reabsorption and suppress active vitamin D production, lowering serum phosphate", "It is secreted by the parathyroid glands to increase calcium absorption from bone and intestine", "It stimulates osteoblast differentiation and bone mineralisation by activating FGFR1 on osteoblast precursors", "It is produced by the kidney to signal phosphate deficiency to osteoclasts, driving bone resorption to release phosphate"],
        k: 3,
        rationale: "FGF23 is a bone-derived hormone (phosphatonin) that reduces renal phosphate reabsorption (via NaPi cotransporters) and suppresses 1α-hydroxylase, lowering 1,25-dihydroxyvitamin D. Excess FGF23 causes hypophosphataemic rickets; deficiency causes hyperphosphataemia and ectopic calcification."
    },
    {
        system: "Skeletal System",
        stem: "In rheumatoid arthritis, what is the role of synovial pannus tissue in joint destruction?",
        options: ["Pannus is a fibrocartilaginous repair tissue that replaces damaged hyaline cartilage with mechanically inferior scar tissue", "Pannus is an invasive vascularised granulation tissue derived from hyperplastic synoviocytes that directly erodes cartilage and subchondral bone through protease and cytokine secretion", "Pannus forms when synovial fluid accumulates under pressure and mechanically displaces articular cartilage from subchondral bone", "Pannus is a layer of immune complexes deposited on the articular surface that activates complement and causes chondrocyte apoptosis"],
        k: 0,
        rationale: "In RA, activated synoviocytes and infiltrating immune cells form invasive pannus. It secretes MMPs (matrix metalloproteinases) and cathepsins that directly destroy cartilage, while TNF-α and IL-17 drive osteoclast-mediated bone erosion at pannus-bone interfaces."
    },
    {
        system: "Skeletal System",
        stem: "What is the molecular explanation for the increased fracture risk in osteoporosis beyond simply reduced bone mineral density?",
        options: ["Osteoporotic bone uniquely lacks type I collagen entirely, leaving only poorly mineralised osteoid that fractures under minimal stress", "Osteoporosis involves not only reduced bone mass but also deterioration of bone microarchitecture (trabecular thinning, perforation, and loss of connectivity) and impaired bone material properties including increased collagen crosslink abnormalities", "The reduced BMD leads to compensatory osteoblast hyperactivity producing structurally defective woven bone replacing normal lamellar bone", "Fracture risk increases solely due to increased osteoclast activity dissolving periosteal bone, thinning cortical walls without affecting trabecular architecture"],
        k: 0,
        rationale: "BMD explains only about 60-70% of fracture risk variance. Trabecular architecture deterioration (perforation of plates, loss of cross-struts) dramatically reduces load-bearing capacity beyond what BMD predicts. Collagen maturation defects and microdamage accumulation further compromise bone quality."
    },

    /* ---- MUSCULAR & EXERCISE PHYSIOLOGY (15) ---- */
    {
        system: "Exercise Physiology",
        stem: "What is the molecular trigger for exercise-induced mitochondrial biogenesis in skeletal muscle?",
        options: ["Elevated serum insulin concentrations activating PI3K-Akt-mTOR signalling in muscle fibres", "PGC-1α (peroxisome proliferator-activated receptor gamma coactivator 1-alpha) activation by AMPK and p38 MAPK in response to energy stress and calcium signalling during exercise", "Direct transcriptional activation of mitochondrial DNA by reactive oxygen species produced during exercise", "Satellite cell fusion with existing fibres bringing new mitochondria from quiescent muscle stem cells"],
        k: 0,
        rationale: "PGC-1α is the master regulator of mitochondrial biogenesis. Exercise activates AMPK (low ATP:AMP ratio) and p38 MAPK, which phosphorylate and activate PGC-1α. It then co-activates transcription factors driving expression of both nuclear and mitochondrial genes encoding respiratory chain components."
    },
    {
        system: "Exercise Physiology",
        stem: "Explain the Frank-Starling mechanism of the heart.",
        options: ["Heart rate increases proportionally to venous return due to stretch-activated baroreceptors in the atrial wall", "Increased ventricular end-diastolic volume stretches myocardial sarcomeres toward optimal filament overlap, increasing calcium sensitivity of troponin and the force of subsequent contraction without requiring neural input", "Sympathetic innervation of the SA node increases stroke volume through positive chronotropy independent of preload", "Coronary artery vasodilation increases myocardial oxygen supply, directly increasing ATP availability and contractile force"],
        k: 0,
        rationale: "The Frank-Starling law states that stroke volume increases intrinsically in response to greater preload (ventricular filling). Sarcomere stretch optimises actin-myosin overlap and increases myofilament calcium sensitivity, allowing the heart to automatically match output to venous return."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the significance of the lactate threshold (LT) in exercise physiology?",
        options: ["It is the exercise intensity at which blood lactate first becomes detectable, indicating anaerobic glycolysis has commenced for the first time", "It is the exercise intensity above which lactate production exceeds the body's capacity to clear it, causing progressive accumulation — it correlates strongly with endurance performance", "It represents the maximal oxygen uptake (VO2max) of the individual and is therefore the primary determinant of aerobic fitness", "It is the point at which type I muscle fibres are fully exhausted and type II fibres are exclusively recruited"],
        k: 0,
        rationale: "LT (or the related concept OBLA — Onset of Blood Lactate Accumulation at 4 mmol/L) reflects the balance between glycolytic flux and lactate clearance. Athletes with higher LT as a percentage of VO2max sustain faster paces aerobically. Training shifts LT rightward."
    },
    {
        system: "Exercise Physiology",
        stem: "What is excitation-contraction coupling in cardiac muscle, and how does it differ from skeletal muscle?",
        options: ["Cardiac muscle relies entirely on intracellular calcium stores with no calcium influx across the sarcolemma, while skeletal muscle depends entirely on extracellular calcium entering through L-type channels", "In cardiac muscle, calcium-induced calcium release (CICR) means trigger calcium entering through L-type channels activates ryanodine receptors (RyR2) to release far more calcium from the SR; skeletal muscle relies primarily on mechanical coupling between DHPR and RyR1 without requiring calcium influx", "Both muscle types use identical mechanisms; the only difference is the density of L-type calcium channels in their respective T-tubule membranes", "Cardiac muscle contraction is triggered exclusively by IP3-mediated calcium release from the endoplasmic reticulum, while skeletal muscle uses voltage-dependent DHPR-RyR1 coupling"],
        k: 0,
        rationale: "CICR in cardiac muscle means the heart is much more dependent on extracellular calcium and is exquisitely sensitive to drugs and conditions affecting calcium handling (e.g., calcium channel blockers reduce contractility). Skeletal muscle RyR1 is directly gated by DHPR conformational change, making it more self-contained."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the mTORC1 signalling pathway's role in exercise-induced muscle protein synthesis?",
        options: ["mTORC1 suppresses muscle protein synthesis during resistance exercise to conserve amino acids for energy metabolism", "Resistance exercise activates mTORC1 through mechanical stimulation, amino acid sensing, and growth factor signalling, driving ribosome biogenesis and mRNA translation to increase muscle protein synthesis rates", "mTORC1 exclusively mediates the catabolic response to endurance exercise by activating autophagy and proteasomal degradation pathways", "mTORC1 activation during exercise signals satellite cells to proliferate and fuse into existing fibres, which is the sole mechanism of muscle hypertrophy"],
        k: 0,
        rationale: "mTORC1 phosphorylates p70S6K1 and 4EBP1, promoting ribosome biogenesis and cap-dependent mRNA translation. Leucine is a particularly potent mTORC1 activator via Rag GTPases. mTORC1's role in hypertrophy is confirmed by rapamycin (mTOR inhibitor) blocking exercise-induced muscle growth."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the oxygen dissociation curve, and what is the physiological importance of its sigmoidal shape?",
                options: ["The sigmoidal shape results from random variation in haemoglobin oxygen affinity and has no particular physiological advantage over a hyperbolic curve", "The sigmoidal shape reflects cooperative binding: once one oxygen binds, haemoglobin's affinity for subsequent oxygens increases (T→R state transition), enabling efficient loading at high PO2 (lungs) and substantial unloading at lower PO2 (tissues)", "The curve is sigmoidal because haemoglobin undergoes irreversible structural changes upon initial oxygenation that permanently increase binding affinity for subsequent oxygen molecules", "The sigmoidal shape is produced by the two alpha subunits of haemoglobin binding oxygen before the two beta subunits, creating a sequential rather than cooperative binding pattern"],
        k: 0,
        rationale: "Cooperative binding (allostery) means the T (tense, low-affinity) to R (relaxed, high-affinity) state transition makes haemoglobin ideal for bulk oxygen transport. The steep middle portion of the curve means small PO2 changes in tissues cause large O2 unloading. 2,3-BPG, CO2, H+, and temperature shift the curve rightward (Bohr effect)."
    },
    {
        system: "Exercise Physiology",
        stem: "How does the sympathetic nervous system increase heart rate at the molecular level?",
        options: ["Norepinephrine binds β1-adrenoceptors on SA node cells, activating Gs protein, raising cAMP via adenylyl cyclase, which activates PKA to phosphorylate HCN (funny current) channels, accelerating spontaneous depolarisation rate", "Acetylcholine binds nicotinic receptors on SA node cells, opening sodium channels that directly depolarise the pacemaker cells to threshold more rapidly", "Sympathetic nerve terminals release ATP that directly opens P2X channels in SA node cells, causing rapid depolarisation independent of second messenger systems", "Norepinephrine binds α1-adrenoceptors, activating PLC-IP3 signalling to release calcium from SA node SR, which directly gates voltage-sensitive calcium channels"],
        k: 3,
        rationale: "β1-adrenoceptor → Gs → adenylyl cyclase → ↑cAMP → PKA. PKA phosphorylates: HCN4 channels (increases If 'funny current'), L-type Ca2+ channels (increases ICaL, positive inotropy), phospholamban (enhances SR Ca2+ reuptake, positive lusitropy). This comprehensively explains sympathetic cardiac acceleration."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the role of myokines in the systemic health benefits of exercise?",
        options: ["Myokines are degradation products of contractile proteins released during muscle damage that signal immune cells to initiate repair processes exclusively within injured muscle tissue", "Myokines are cytokines and peptides secreted by contracting skeletal muscle that act in autocrine, paracrine, and endocrine fashions to mediate inter-organ crosstalk, including anti-inflammatory, metabolic, and neurotrophic effects throughout the body", "Myokines exclusively regulate satellite cell activation and muscle regeneration without any significant systemic endocrine effects", "Myokines are hormones secreted by the hypothalamus in response to afferent signals from proprioceptors during exercise that coordinate the systemic metabolic response"],
        k: 0,
        rationale: "Key myokines include IL-6 (anti-inflammatory in exercise context, stimulates fat oxidation), irisin (promotes browning of adipose tissue, neurotrophic), BDNF (neuroplasticity), FGF21 (metabolic regulation), and myostatin (negative regulator of muscle mass). This identifies muscle as a secretory endocrine organ."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the Fick principle and its application to calculating maximal oxygen consumption (VO2max)?",
        options: ["VO2max equals the product of maximum heart rate and body surface area, with oxygen extraction coefficient applied as a correction factor", "VO2max = cardiac output × arteriovenous oxygen difference (a-vO2 diff); maximised by both maximal cardiac output and maximal peripheral oxygen extraction, with central cardiac limitations dominating in most individuals", "The Fick principle states that VO2max is solely determined by pulmonary diffusing capacity and is therefore unchanged by cardiac training adaptations", "VO2max is calculated from the respiratory exchange ratio (RER) at maximal effort, where RER of 1.0 indicates pure carbohydrate oxidation at maximal intensity"],
        k: 0,
        rationale: "Adolf Fick's principle: oxygen consumed = cardiac output × (arterial O2 content − venous O2 content). VO2max is limited centrally (maximum cardiac output ~20-25 L/min in trained athletes) and peripherally (a-vO2 diff ~16-17 mL/100mL blood). Training improves both components."
    },
    {
        system: "Exercise Physiology",
        stem: "What molecular mechanism underlies insulin resistance in skeletal muscle with chronic physical inactivity?",
        options: ["Inactivity reduces GLUT4 transporter expression at baseline but does not affect insulin-stimulated translocation to the sarcolemma", "Intramyocellular lipid accumulation generates ceramide and diacylglycerol species that activate PKC-θ and inhibit IRS-1 serine phosphorylation, impairing PI3K-Akt-GLUT4 signalling downstream of the insulin receptor", "Physical inactivity primarily increases hepatic glucose output rather than impairing skeletal muscle insulin sensitivity directly", "Inactivity causes downregulation of the insulin receptor itself through decreased gene transcription driven by reduced mechanical loading of myofibres"],
        k: 0,
        rationale: "Lipotoxic intermediates from incomplete fatty acid oxidation activate novel PKCs that serine-phosphorylate IRS-1 (converting it from a PI3K activator to an inhibitor). Exercise reverses this through AMPK-mediated insulin-independent GLUT4 translocation and improved lipid oxidative capacity."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the molecular basis of heat acclimatisation in exercising humans?",
        options: ["Heat acclimatisation involves genetic mutation of temperature-sensitive ion channels within two weeks of repeated heat exposure", "Repeated heat stress upregulates heat shock proteins (particularly HSP70), increases plasma volume through aldosterone-mediated sodium and water retention, and improves sudomotor function and cardiovascular stability through adaptations in thermoregulatory centres", "Heat acclimatisation is entirely a cardiovascular adaptation involving left ventricular hypertrophy increasing stroke volume during thermal challenge", "Acclimatisation involves downregulation of hypothalamic temperature set-point through progressive desensitisation of anterior hypothalamic thermosensitive neurons"],
        k: 0,
        rationale: "Key acclimatisation adaptations: ↑plasma volume (earlier, more copious sweating), ↑sweat rate with reduced sweat sodium concentration (aldosterone effect), lower core temperature threshold for sweating, reduced cardiovascular strain, and upregulation of cytoprotective HSPs that prevent protein denaturation."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the molecular mechanism of exercise-induced GLUT4 translocation in skeletal muscle?",
        options: ["Exercise activates insulin receptor autophosphorylation through mechanical distortion of the receptor's extracellular domain, initiating the identical signalling cascade as insulin", "AMPK activated by low ATP:AMP ratio and CaMKII activated by calcium transients during contraction phosphorylate TBC1D1 and TBC1D4 (AS160), inactivating their GAP activity toward Rab GTPases, allowing GLUT4 storage vesicles to dock and fuse with the sarcolemma", "Exercise-induced adrenaline binds β2-adrenoceptors on muscle, activating cAMP-PKA signalling that directly phosphorylates GLUT4 vesicle-associated VAMP2, enabling membrane fusion", "Mechanical stretch of the sarcolemma during contraction directly opens mechanosensitive GLUT4 channels embedded in the plasma membrane, bypassing intracellular vesicle trafficking entirely"],
        k: 0,
        rationale: "TBC1D1 and TBC1D4 are Rab-GAPs that normally keep Rab10/8a in GDP-bound (inactive) state, retaining GLUT4 vesicles intracellularly. AMPK and CaMKII phosphorylation inhibits this GAP activity, activating Rabs and enabling GLUT4 vesicle exocytosis — this is clinically significant for type 2 diabetes management."
    },
    {
        system: "Exercise Physiology",
        stem: "How does detraining affect skeletal muscle at the molecular and fibre-type level?",
        options: ["Detraining exclusively reduces muscle fibre number (hyperplasia reversal) with no changes in individual fibre diameter or metabolic enzyme content", "Within weeks, detraining reduces mitochondrial density and oxidative enzyme activity, shifts fibre type composition toward type IIx fibres, decreases capillary density, and reduces muscle protein synthesis rates — with aerobic adaptations lost faster than strength adaptations", "Strength adaptations are lost within days of detraining due to rapid sarcomere disassembly, while aerobic enzyme changes persist for months due to mitochondrial longevity", "Detraining only affects the nervous system's motor unit recruitment patterns without any structural or biochemical changes in the muscle fibres themselves"],
        k: 0,
        rationale: "Aerobic adaptations (mitochondrial density, oxidative enzymes, capillarity) regress within 2-4 weeks of inactivity. Strength and hypertrophy changes persist longer due to maintained neural drive and slower myofibrillar protein turnover. The 'muscle memory' phenomenon involves epigenetic changes at myonuclei."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the mechanistic basis of overtraining syndrome (OTS)?",
        options: ["OTS results from complete glycogen depletion causing irreversible mitochondrial damage and permanent type I fibre atrophy", "OTS likely involves dysregulation of the hypothalamic-pituitary-adrenal axis, chronic systemic inflammation from excessive training load, altered neurotransmitter balance (particularly serotonin:dopamine ratio), and autonomic nervous system imbalance leading to parasympathetic dominance", "OTS is caused exclusively by iron deficiency anaemia resulting from increased haemolysis during high-impact exercise", "OTS is a purely psychological phenomenon with no demonstrable neuroendocrine or inflammatory biomarker changes distinguishing it from normal training fatigue"],
        k: 0,
        rationale: "OTS biomarkers are inconsistent but may include elevated cytokines (IL-6, IL-1β), suppressed testosterone:cortisol ratio, altered HPA axis reactivity, and sympathetic-to-parasympathetic ANS shift (reduced HRV). The mechanisms overlap with chronic fatigue syndrome, making diagnosis and treatment challenging."
    },
    {
        system: "Exercise Physiology",
        stem: "What is the molecular role of AMP-activated protein kinase (AMPK) as an energy sensor in skeletal muscle during exercise?",
        options: ["AMPK is activated by rising ATP concentration during exercise and drives anabolic processes including protein synthesis and glycogen deposition to prepare for subsequent bouts", "AMPK is activated by increased AMP:ATP ratio (energy deficit) during exercise; it inhibits anabolic pathways (mTORC1, fatty acid synthesis) and activates catabolic pathways (fatty acid oxidation, GLUT4 translocation, mitochondrial biogenesis via PGC-1α) to restore energy balance", "AMPK exclusively regulates cardiac muscle energy metabolism and has no significant direct role in skeletal muscle during exercise", "AMPK activation during exercise primarily signals satellite cell activation for immediate muscle repair rather than acute metabolic regulation"],
        k: 0,
        rationale: "AMPK is the cellular energy rheostat. Its targets in muscle include: ACC (phospho-inhibition→↑fatty acid oxidation), PFK-2 (↑glycolysis), TBC1D1/4 (↑GLUT4), TSC2 (inhibits mTORC1→↓protein synthesis), and PGC-1α (↑mitochondrial biogenesis). This coordinated response is fundamental to metabolic adaptation to exercise."
    },
                   /* ---- CARDIOVASCULAR & RESPIRATORY PHYSIOLOGY (15) ---- */
    {
        system: "Cardiovascular Physiology",
        stem: "What is the molecular mechanism of action of cardiac glycosides (e.g., digoxin) in heart failure?",
        options: ["Digoxin activates β1-adrenoceptors on cardiomyocytes, mimicking sympathetic stimulation to increase heart rate and contractility", "Digoxin inhibits Na+/K+-ATPase on cardiomyocytes, raising intracellular Na+, which reduces NCX extrusion of Ca2+, increasing intracellular Ca2+ stores and enhancing contractility; it also increases vagal tone reducing heart rate", "Digoxin blocks L-type calcium channels, paradoxically increasing contractility by prolonging the action potential plateau and allowing more calcium to enter", "Digoxin activates phosphodiesterase III to prevent cAMP breakdown, elevating intracellular cAMP and activating PKA-mediated phosphorylation of calcium handling proteins"],
        k: 0,
        rationale: "Na+/K+-ATPase inhibition → [Na+]i rises → NCX (3Na+/Ca2+ exchanger) less able to extrude Ca2+ → [Ca2+]i increases → greater SR loading → stronger contractions. Vagal sensitisation slows the ventricular rate in atrial fibrillation. Narrow therapeutic index makes digoxin toxicity monitoring essential."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "Explain the renin-angiotensin-aldosterone system (RAAS) and its role in blood pressure regulation.",
        options: ["Renin cleaves angiotensinogen to angiotensin I; ACE converts it to angiotensin II; AngII causes vasoconstriction via AT1R, stimulates aldosterone from adrenal cortex increasing renal Na+/water retention, stimulates ADH, and promotes cardiac and vascular remodelling — all raising BP", "Renin is released by the posterior pituitary in response to haemorrhage and directly constricts arterioles without requiring conversion to downstream effectors", "Aldosterone is the primary initiator of the cascade, being released directly from the adrenal gland in response to reduced baroreceptor firing, subsequently stimulating renin secretion from the JGA", "ACE directly converts renin to the active effector angiotensin II, which then stimulates the juxtaglomerular apparatus to produce aldosterone in a positive feedback loop"],
        k: 3,
        rationale: "RAAS is a crucial long-term BP regulator. ACE inhibitors block AngII formation; ARBs block AT1R; aldosterone antagonists (spironolactone) block Na+ retention. AngII also directly stimulates sympathetic outflow, cardiac hypertrophy, and renal proximal tubule Na+ reabsorption independent of aldosterone."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the molecular mechanism of nitric oxide (NO) in vascular smooth muscle relaxation?",
        options: ["NO directly hyperpolarises smooth muscle cell membranes by activating ATP-sensitive potassium channels, reducing calcium entry through voltage-gated channels", "NO diffuses into smooth muscle cells and activates soluble guanylate cyclase, increasing cGMP, which activates PKG; PKG phosphorylates myosin light chain kinase (MLCK) reducing its activity, and promotes SR calcium sequestration and KATP channel activation, causing vasodilation", "NO binds to prostacyclin receptors on smooth muscle cells, inhibiting phospholipase C and reducing IP3-mediated calcium release from the SR", "NO covalently modifies and permanently inactivates voltage-gated L-type calcium channels on vascular smooth muscle, causing irreversible vasodilation that persists well beyond NO's half-life"],
        k: 0,
        rationale: "eNOS produces NO from L-arginine in endothelium. cGMP-PKG signalling is the primary pathway: MLCK phosphorylation reduces actin-myosin interaction, while BKCa and KATP channel activation hyperpolarises the membrane. PDE5 inhibitors (sildenafil) potentiate NO signalling by preventing cGMP breakdown."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the pathophysiological mechanism of atherosclerosis at the molecular level?",
        options: ["Atherosclerosis begins when high-density lipoproteins deposit directly into the arterial intima, triggering a foreign body giant cell reaction that calcifies into plaque", "LDL particles enter and become retained in the arterial intima where they undergo oxidative modification; oxidised LDL triggers endothelial dysfunction, monocyte recruitment, macrophage foam cell formation, smooth muscle migration, and fibrous cap development over a lipid-rich necrotic core", "Atherosclerotic plaques form from calcium phosphate crystals precipitating from supersaturated blood onto damaged endothelium, with lipid accumulation being a secondary phenomenon", "Plaque formation begins with platelet adhesion to intact endothelium that releases growth factors causing smooth muscle proliferation, which then passively traps circulating lipoproteins within the vessel wall"],
        k: 0,
        rationale: "Key molecular steps: LDL retention → oxidation → SR-A and CD36 scavenger receptor uptake by macrophages → foam cells → fatty streak → VSMC migration driven by PDGF → fibrous cap. Plaque rupture exposes thrombogenic core, triggering ACS. Statins reduce LDL; anti-inflammatory strategies are emerging."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the molecular basis of pulmonary arterial hypertension (PAH)?",
        options: ["PAH results from left heart failure causing passive elevation of pulmonary venous pressure that is transmitted backward to the pulmonary arteries", "PAH involves loss-of-function mutations in BMPR2 (bone morphogenetic protein receptor 2) in familial forms, leading to excessive pulmonary arterial smooth muscle cell proliferation and reduced apoptosis; endothelin-1, thromboxane, and reduced prostacyclin/NO further drive vasoconstriction and remodelling", "PAH is caused by hypoxic pulmonary vasoconstriction becoming permanent after prolonged altitude exposure, with no role for genetic factors or endothelial dysfunction", "PAH results from autoimmune destruction of pulmonary capillary endothelial cells causing progressive obliteration of the pulmonary vascular bed with no involvement of smooth muscle proliferation"],
        k: 0,
        rationale: "BMPR2 mutations (50-80% of heritable PAH) impair anti-proliferative BMP signalling. Approved therapies target: endothelin axis (bosentan), NO-cGMP axis (sildenafil, riociguat), and prostacyclin pathway (epoprostenol). Imbalance of vasodilators (PGI2, NO) versus vasoconstrictors (ET-1, TXA2) drives both vasoconstriction and proliferative remodelling."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the physiological mechanism of the baroreceptor reflex?",
        options: ["Baroreceptors in the carotid body detect arterial oxygen content and reflexly increase heart rate when PaO2 falls below 60 mmHg via glossopharyngeal afferents", "Stretch-sensitive mechanoreceptors in the carotid sinus and aortic arch increase firing with rising arterial pressure; afferent signals via CN IX and X to the NTS increase parasympathetic outflow (reducing HR) and decrease sympathetic outflow (reducing SV and peripheral resistance), buffering acute BP changes", "Baroreceptors detect blood viscosity changes and trigger reflex erythropoiesis to normalise oxygen delivery when viscosity falls", "Low pressure baroreceptors in the ventricles detect reduced filling and directly activate renin secretion from the JGA through a direct sympathetic reflex arc bypassing the central nervous system"],
        k: 0,
        rationale: "The arterial baroreflex provides rapid (seconds) beat-to-beat BP buffering. It is a negative feedback system — hypertension is corrected by increased vagal inhibition of the heart. Chronic hypertension resets baroreceptors to the higher level. Baroreflex sensitivity is reduced in heart failure, contributing to autonomic imbalance."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is hypoxic pulmonary vasoconstriction (HPV) and what is its proposed molecular mechanism?",
        options: ["HPV is vasodilation of pulmonary arteries in response to low oxygen, directing blood to better-ventilated regions through prostacyclin-mediated smooth muscle relaxation", "HPV is constriction of pulmonary arterioles in response to alveolar hypoxia, diverting blood to better-ventilated regions; the mechanism involves mitochondrial reactive oxygen species sensing causing inhibition of Kv channels, membrane depolarisation, L-type Ca2+ channel activation, and smooth muscle contraction", "HPV is mediated by endothelin receptors on pulmonary smooth muscle that directly sense dissolved O2 concentration through a haem-containing O2 binding domain", "HPV involves ATP release from hypoxic type II pneumocytes activating P2Y receptors on adjacent smooth muscle cells, triggering IP3-mediated calcium release and contraction"],
        k: 0,
        rationale: "HPV is unique to pulmonary vasculature (systemic vessels dilate to hypoxia). It optimises V/Q matching — hypoxic alveoli have reduced blood flow, preventing perfusion of unventilated lung. In generalised hypoxia (altitude, COPD), HPV becomes maladaptive, causing pulmonary hypertension. HIF-1α drives chronic remodelling."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What are the molecular targets of commonly used antihypertensive drug classes?",
        options: ["ACE inhibitors block renin secretion; ARBs block aldosterone receptors; beta-blockers block α1-adrenoceptors; CCBs block ryanodine receptors in cardiac SR", "ACE inhibitors block conversion of AngI→AngII; ARBs block AT1R; beta-blockers reduce sympathetic cardiac drive (HR/SV); CCBs block L-type Ca2+ channels reducing vascular tone and cardiac contractility; thiazides reduce plasma volume", "All antihypertensives ultimately act on the same final common pathway of reducing intracellular calcium in smooth muscle through distinct upstream mechanisms converging on cGMP elevation", "Beta-blockers directly vasodilate peripheral arteries through β2-adrenoceptor activation; ACE inhibitors stimulate atrial natriuretic peptide release; ARBs block ACE directly rather than angiotensin receptors"],
        k: 0,
        rationale: "These five major classes address different components: RAAS (ACEi, ARB), sympathetic nervous system (β-blocker), smooth muscle calcium handling (CCB), and renal volume (thiazides). Their different mechanisms explain synergistic BP reduction when combined, and their different side-effect profiles guide individualised prescribing."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the mechanism of myocardial stunning and hibernation as adaptations to chronic ischaemia?",
        options: ["Stunning and hibernation both represent permanent structural loss of cardiomyocytes replaced by fibrotic scar tissue that is indistinguishable from infarcted myocardium on imaging", "Stunning is prolonged but reversible contractile dysfunction after transient ischaemia-reperfusion (caused by calcium overload and ROS injury); hibernation is chronic downregulation of contractile function in viable myocardium with chronic reduced flow — both are reversible with revascularisation", "Stunning refers to permanent reduction in heart rate following ischaemia due to SA node fibrosis; hibernation refers to right ventricular adaptation to chronic pulmonary hypertension", "Both stunning and hibernation result from irreversible mitochondrial permeability transition pore opening causing cardiomyocyte metabolic failure, distinguishing them from infarcted zones only by degree of ATP depletion"],
        k: 0,
        rationale: "Distinguishing viable but dysfunctional myocardium (stunned/hibernating) from scar is critical: viable tissue recovers with revascularisation (PCI or CABG) while scar does not. FDG-PET, dobutamine stress echo, and cardiac MRI with gadolinium can identify viability preoperatively."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What molecular changes drive pathological cardiac hypertrophy versus physiological (exercise-induced) cardiac hypertrophy?",
        options: ["Exercise hypertrophy involves cardiomyocyte hypertrophy driven by PI3K(p110α)-Akt-mTOR signalling with normal or enhanced function; pathological hypertrophy activates calcineurin-NFAT and MAPK pathways, driving fetal gene re-expression (β-MHC, ANP, BNP), fibrosis, and impaired diastolic function", "Exercise and pathological hypertrophy are molecularly identical — the functional difference reflects only the degree of hypertrophy rather than the signalling pathways engaged", "Pathological hypertrophy is purely a consequence of cardiomyocyte hyperplasia (cell number increase) while physiological hypertrophy involves only cardiomyocyte enlargement", "Exercise hypertrophy is exclusively driven by the mechanical stretch of cardiac myocytes directly activating sarcomeric protein synthesis without any growth factor receptor involvement"],
        k: 3,
        rationale: "Physiological: PI3K-Akt-mTOR (IGF-1/insulin signalling), concentric or eccentric geometry, preserved or improved function, reversible. Pathological: calcineurin dephosphorylates NFAT → nuclear translocation → fetal gene program, reactive fibrosis via TGF-β, mitochondrial dysfunction, diastolic and systolic impairment. This distinction is therapeutically and prognostically critical."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the molecular basis of sickle cell disease and how does it affect microvascular blood flow?",
        options: ["A point mutation (Glu6Val) in β-globin causes HbS to polymerise under deoxygenated conditions, distorting erythrocytes into rigid sickle shapes that obstruct microvascular flow, cause vaso-occlusive crises, haemolysis, endothelial dysfunction, and chronic organ damage", "Sickle cell disease involves deletion of both β-globin genes, resulting in β-thalassaemia major with compensatory fetal haemoglobin (HbF) production preventing sickling", "A point mutation causes HbS to have increased oxygen affinity, preventing normal oxygen unloading to tissues and causing functional anaemia without any change in red cell morphology", "HbS polymerisation occurs under fully oxygenated conditions in the pulmonary capillaries, causing primary lung disease with secondary haematological consequences rather than microvascular obstruction"],
        k: 3,
        rationale: "Val6 creates a hydrophobic patch that allows HbS-HbS polymerisation when deoxygenated. Hydroxyurea treatment increases HbF production (which doesn't sickle). Gene therapy strategies include β-globin gene addition and BCL11A silencing to reactivate HbF. Understanding the molecular defect enabled the first disease-modifying treatments."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is von Willebrand factor (vWF) and what is its role in haemostasis?",
        options: ["vWF is a clotting factor produced by hepatocytes that acts in the final common pathway to crosslink fibrin monomers into a stable clot", "vWF is a large multimeric glycoprotein produced by endothelial cells and platelets that bridges damaged subendothelial collagen to platelet GPIb receptors under high shear, facilitating primary platelet plug formation; it also acts as a carrier for factor VIII, protecting it from premature degradation", "vWF is an anticoagulant protein that prevents inappropriate platelet activation in intact vessels by binding and inactivating thrombin", "vWF is synthesised exclusively by megakaryocytes and stored in platelet alpha granules, released only during platelet activation to amplify secondary haemostasis through the intrinsic pathway"],
        k: 0,
        rationale: "vWD (von Willebrand disease) is the most common inherited bleeding disorder. High shear stress unfolds vWF multimers exposing GPIb binding sites — this shear-dependent adhesion is most critical in arterioles and damaged vessel areas. ADAMTS13 cleaves ultralarge vWF multimers; its deficiency causes TTP."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the molecular cascade of the coagulation pathway leading to fibrin clot formation?",
        options: ["Tissue factor exposed by vascular injury binds factor VIIa (extrinsic pathway), activating factor X; Xa with Va forms prothrombinase converting prothrombin to thrombin; thrombin converts fibrinogen to fibrin monomers that polymerise and are crosslinked by factor XIIIa", "The coagulation cascade begins exclusively through the intrinsic pathway when factor XII contacts collagen; the extrinsic pathway is only relevant in laboratory tests and has no in vivo significance", "Thrombin is the first activated factor produced by the extrinsic pathway; it then activates all other coagulation factors in sequence before fibrinogen conversion occurs as the terminal step", "Fibrinogen spontaneously polymerises into fibrin at sites of vascular injury without requiring enzyme activation; thrombin merely accelerates a thermodynamically favourable spontaneous process"],
        k: 3,
        rationale: "TF-VIIa initiates in vivo coagulation (extrinsic); the intrinsic pathway (contact activation) amplifies it. Warfarin inhibits vitamin K-dependent factors (II, VII, IX, X, protein C/S). Direct oral anticoagulants (DOACs) target factor Xa (apixaban, rivaroxaban) or thrombin (dabigatran) directly."
    },
    {
        system: "Cardiovascular Physiology",
        stem: "What is the molecular mechanism of complement system activation in the immune response, and how does it affect vascular permeability?",
        options: ["The complement system is activated exclusively through the classical pathway requiring antigen-antibody complex formation; it has no role in innate immunity or sterile inflammatory conditions", "Complement activation (classical, lectin, or alternative pathways) converges on C3 convertase cleaving C3 into C3a and C3b; C3b opsonises pathogens for phagocytosis; C5a is a potent anaphylatoxin causing mast cell degranulation and vascular permeability increase; MAC (C5b-9) directly lyses pathogens", "Complement proteins increase vascular permeability by directly binding endothelial tight junction proteins ZO-1 and occludin and causing their proteolytic degradation", "Complement activation terminates the inflammatory response by opsonising and clearing inflammatory mediators, reducing rather than increasing vascular permeability during acute inflammation"],
        k: 0,
        rationale: "C5a and C3a (anaphylatoxins) bind receptors on mast cells and basophils triggering histamine release, and directly on endothelial cells causing retraction and gap formation. C5a is also a powerful neutrophil chemoattractant. Hereditary angioedema results from C1-inhibitor deficiency causing uncontrolled bradykinin and complement activation."
    },
                   /* ---- NEUROSCIENCE & ENDOCRINOLOGY (15) ---- */
    {
        system: "Neuroscience",
        stem: "What is the molecular basis of long-term potentiation (LTP) and its role in memory formation?",
        options: ["LTP involves permanent insertion of new AMPA receptors into synapses driven by CREB-mediated gene transcription, with NMDA receptor activation merely providing the initial calcium signal that is not itself required for maintenance", "LTP is initiated by NMDA receptor activation (requiring simultaneous pre- and postsynaptic activity — Hebb's rule), causing Ca2+ influx activating CaMKII, which phosphorylates and inserts AMPA receptors; late LTP requires CREB-mediated protein synthesis for structural synaptic changes underlying long-term memory", "LTP is mediated exclusively by increased presynaptic neurotransmitter release with no postsynaptic structural or functional changes occurring during the induction or maintenance phases", "LTP requires the prior removal of existing AMPA receptors (LTD) before new NMDA-receptor-triggered insertion can occur, meaning LTP is always preceded by a transient period of reduced synaptic efficacy"],
        k: 0,
        rationale: "NMDA receptors are the Hebbian coincidence detector (voltage-dependent Mg2+ block removed by depolarisation). Ca2+ influx → CaMKII autophosphorylation (enabling sustained kinase activity) → AMPA receptor phosphorylation and exocytosis. Late LTP: BDNF-TrkB signalling, PKA, and CREB drive dendritic spine enlargement and new synapse formation."
    },
    {
        system: "Neuroscience",
        stem: "What is the hypothalamic-pituitary-adrenal (HPA) axis and how does chronic stress alter its function?",
        options: ["CRH from hypothalamus → ACTH from anterior pituitary → cortisol from adrenal cortex; cortisol provides negative feedback to hypothalamus and pituitary; chronic stress causes glucocorticoid receptor downregulation in feedback centres, impairing negative feedback and sustaining elevated cortisol with consequences for immune function, metabolism, neuroplasticity, and mental health", "The HPA axis exclusively regulates inflammatory responses; its primary role in stress is to stimulate pro-inflammatory cytokine production to combat infection risk during stressful periods", "Chronic stress permanently upregulates HPA axis sensitivity through epigenetic silencing of the CRH promoter, paradoxically reducing cortisol output in the chronic stress state", "The HPA axis operates independently of the hypothalamus in chronic stress, with the pituitary directly sensing plasma cortisol and producing ACTH autonomously without hypothalamic CRH input"],
        k: 3,
        rationale: "Chronic stress reduces hippocampal glucocorticoid receptor density (epigenetic mechanisms including FKBP5, NR3C1 methylation), impairing feedback. Sustained hypercortisolaemia causes hippocampal neuronal atrophy (reducing memory/mood regulation), immunosuppression, metabolic syndrome, and increased psychiatric disorder risk. Adverse childhood experiences can epigenetically programme HPA dysregulation."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular mechanism of general anaesthesia at the neuronal level?",
        options: ["General anaesthetics block all voltage-gated sodium channels throughout the CNS, completely abolishing action potential propagation in both sensory and motor pathways simultaneously", "The mechanisms vary by agent but commonly include potentiation of inhibitory GABA-A receptor activity, inhibition of excitatory NMDA receptors, and modulation of two-pore domain potassium channels — collectively reducing thalamocortical and corticothalamic connectivity", "Inhalational anaesthetics dissolve in neuronal lipid bilayers causing generalised membrane fluidisation that non-specifically reduces the function of all membrane proteins equally", "General anaesthetics specifically target and inactivate the reticular activating system through selective high-affinity binding to adenosine A1 receptors on RAS projection neurons"],
        k: 0,
        rationale: "Propofol and barbiturates are primarily positive GABA-A allosteric modulators. Ketamine is primarily an NMDA receptor antagonist. Volatile agents (sevoflurane) have multiple targets. The corticothalamic feedback loop disruption hypothesis best explains loss of consciousness — network connectivity collapse rather than synaptic silencing."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular pathology of Alzheimer's disease?",
        options: ["Alzheimer's is caused by prion protein misfolding spreading from cell to cell, distinct from amyloid and tau pathology, which are secondary epiphenomena without mechanistic roles", "Alzheimer's involves extracellular deposition of amyloid-β (cleaved from APP by β- and γ-secretases) forming senile plaques, and intracellular accumulation of hyperphosphorylated tau forming neurofibrillary tangles — both driving neuroinflammation, synaptic dysfunction, and neuronal loss", "Alzheimer's pathology begins with neuroinflammation driven by TREM2 loss-of-function mutations in microglia, with amyloid and tau being inflammatory products rather than primary pathological drivers", "The primary molecular event in Alzheimer's is mitochondrial dysfunction causing ATP depletion in hippocampal neurons, with amyloid and tau accumulation being compensatory responses to energy failure"],
        k: 0,
        rationale: "The amyloid cascade hypothesis: APP → Aβ42 (β-secretase/BACE1 + γ-secretase/presenilin) → oligomers → plaques → tau hyperphosphorylation → NFTs. APOE4 is the major genetic risk factor, impairing Aβ clearance. Anti-amyloid antibodies (lecanemab, donanemab) are the first approved disease-modifying treatments targeting this cascade."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular basis of action of selective serotonin reuptake inhibitors (SSRIs) and their proposed mechanism in treating depression?",
        options: ["SSRIs immediately increase serotonin in the synapse by blocking SERT; however, the delayed clinical effect (2-4 weeks) reflects downstream neuroplastic changes including BDNF upregulation, hippocampal neurogenesis, and desensitisation of inhibitory 5-HT1A autoreceptors that initially dampen the net effect of SERT blockade", "SSRIs have immediate clinical effects because the immediate synaptic serotonin increase is itself the therapeutic mechanism — the 2-4 week delay is an artefact of gradual drug distribution to all CNS synapses", "SSRIs work by blocking serotonin synthesis in the presynaptic neuron, reducing excessive serotonergic signalling that characterises the depressed state according to the serotonin excess hypothesis of depression", "SSRIs achieve their antidepressant effect by permanently downregulating serotonin transporter gene expression rather than acutely blocking the transporter protein itself"],
        k: 3,
        rationale: "The lag between SERT blockade and clinical response reveals the complexity of depression neurobiology. Autoreceptor desensitisation, BDNF/TrkB signalling, adult hippocampal neurogenesis, and downstream transcriptional changes (CREB, PGC-1α) are all implicated in delayed therapeutic effects. The 'chemical imbalance' narrative significantly oversimplifies the actual pharmacology."
    },
    {
        system: "Neuroscience",
        stem: "What is the glymphatic system and what is its physiological significance?",
        options: ["The glymphatic system is the brain's dedicated lymphatic vessel network running alongside cerebral arteries that drains interstitial proteins directly into cervical lymph nodes", "The glymphatic system is a waste clearance pathway using cerebrospinal fluid flow through para-arterial spaces (Virchow-Robin spaces) driven by astrocytic AQP4 water channels, most active during sleep, clearing metabolic waste including amyloid-β and tau from the brain interstitium", "The glymphatic system provides the primary oxygen and glucose supply to deep white matter regions that are too far from capillaries for diffusion alone", "The glymphatic system refers to the blood-brain barrier's transcytosis mechanism for selectively shuttling large beneficial proteins like BDNF across the endothelium into the brain parenchyma"],
        k: 0,
        rationale: "Discovered by Maiken Nedergaard's group (2013), the glymphatic system is most active during non-REM sleep when AQP4 channel polarisation at astrocytic endfeet facilitates CSF-ISF exchange. Sleep deprivation reduces glymphatic clearance and accelerates amyloid accumulation — providing molecular basis for the sleep-dementia link."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular mechanism of opioid analgesia and tolerance?",
        options: ["Opioids bind Toll-like receptors on microglia, reducing neuroinflammation and central sensitisation; tolerance develops through progressive microglial NLRP3 inflammasome desensitisation", "Opioids bind Gi-coupled μ-opioid receptors, reducing cAMP and activating inward K+ currents while reducing Ca2+ currents — hyperpolarising neurons and reducing transmitter release; tolerance involves receptor desensitisation via GRK/β-arrestin, internalisation, and upregulation of adenylyl cyclase", "Opioids irreversibly block NMDA receptors in the dorsal horn, preventing central sensitisation; tolerance develops through de novo NMDA receptor synthesis that replaces blocked receptors within 24-48 hours", "Opioids work exclusively at peripheral nociceptors with no central mechanism; tolerance is explained entirely by opioid metabolism enzyme induction reducing bioavailability"],
        k: 0,
        rationale: "μOR → Gi/o → ↓AC → ↓cAMP → ↓PKA → ↑GIRK channel opening → hyperpolarisation + ↓presynaptic Ca2+ → ↓substance P/glutamate release. Tolerance: GRK2 phosphorylates activated μOR → β-arrestin recruitment → desensitisation and internalisation + adenylyl cyclase superactivation. β-arrestin bias is a target for developing analgesics with reduced tolerance and respiratory depression."
    },
    {
        system: "Neuroscience",
        stem: "What are the molecular mechanisms underlying neuropathic pain?",
        options: ["Neuropathic pain is caused exclusively by ongoing peripheral tissue damage continuously activating nociceptors; it resolves when tissue healing is complete without any central nervous system contribution", "Neuropathic pain involves peripheral sensitisation (reduced nociceptor thresholds from inflammatory mediators, sodium channel upregulation — particularly Nav1.7/Nav1.8), central sensitisation (NMDA-mediated synaptic potentiation in the dorsal horn), microglial activation releasing pro-nociceptive cytokines, and loss of inhibitory interneuron function", "Neuropathic pain is purely a psychological phenomenon without structural or functional changes in the peripheral or central nervous system that could be identified histologically or electrophysiologically", "Neuropathic pain results exclusively from demyelination of Aβ tactile fibres that then aberrantly contact pain-processing laminae in the dorsal horn without any role for inflammation or central sensitisation"],
        k: 0,
        rationale: "Nav1.7 (SCN9A) gain-of-function mutations cause inherited erythromelalgia (extreme pain); loss-of-function causes congenital analgesia — validating it as an analgesic target. Central sensitisation involves wind-up (temporal summation), LTP-like changes in dorsal horn, glial activation, and descending facilitation from the rostral ventromedial medulla."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular mechanism by which hypoxia-inducible factor (HIF-1α) responds to cellular oxygen levels?",
        options: ["HIF-1α protein levels are constitutively high in all cells; hypoxia activates it post-translationally by preventing its nuclear export rather than by affecting its stability or degradation", "Under normoxia, prolyl hydroxylase domains (PHDs) hydroxylate HIF-1α using O2, allowing VHL E3 ubiquitin ligase binding and proteasomal degradation; in hypoxia, PHDs are inactive, HIF-1α accumulates, dimerises with HIF-1β, and transcribes hypoxia-response genes including EPO, VEGF, and glycolytic enzymes", "HIF-1α is a membrane receptor that transduces hypoxic signals via a conformational change in its oxygen-sensing haem domain, activating JAK-STAT signalling without nuclear translocation", "HIF-1α directly senses oxygen through a haemoglobin-like iron-containing domain within the protein itself and is activated by oxygen rather than stabilised by its absence"],
        k: 0,
        rationale: "The PHD-VHL-HIF axis is a paradigmatic O2-sensing mechanism (2019 Nobel Prize). PHDs require O2, Fe2+, α-ketoglutarate, and ascorbate as cofactors. HIF-1α targets include EPO (erythropoiesis), VEGF (angiogenesis), LDHA and GLUT1 (glycolysis) — a coordinated adaptation to hypoxia. PHD inhibitors are approved for renal anaemia treatment."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular basis of type 1 diabetes mellitus (T1DM) and why does it cause diabetic ketoacidosis (DKA)?",
        options: ["T1DM results from insulin receptor autoantibodies reducing insulin sensitivity; DKA occurs because reduced glucose uptake causes compensatory activation of hepatic ketogenesis through the same mechanism as starvation", "T1DM is an autoimmune disease where T cells and autoantibodies destroy pancreatic β-cells (targeting GAD65, IA-2, insulin, ZnT8), causing absolute insulin deficiency; without insulin, glucagon dominates — activating hepatic glycogenolysis, gluconeogenesis, and unrestrained β-oxidation with ketone body production (acetoacetate, β-hydroxybutyrate) causing metabolic acidosis", "T1DM results from KATP channel gain-of-function mutations preventing glucose-stimulated insulin secretion without any autoimmune component or β-cell destruction", "DKA in T1DM is caused primarily by renal dysfunction failing to excrete ketone acids rather than by increased ketone production, explaining why it occurs only in patients with concurrent renal impairment"],
        k: 0,
        rationale: "Absolute insulin deficiency removes all anabolic restraint: catabolic hormones (glucagon, cortisol, catecholamines) dominate → glycogenolysis + gluconeogenesis (hyperglycaemia → osmotic diuresis → dehydration) + lipolysis → free fatty acids → hepatic β-oxidation → acetyl-CoA → ketogenesis. Both metabolic acidosis and dehydration are life-threatening without prompt insulin and fluid resuscitation."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular mechanism of thyroid hormone synthesis and how do antithyroid drugs interfere with it?",
        options: ["Thyroid hormones are synthesised from cholesterol through a series of P450 hydroxylation steps; antithyroid drugs competitively inhibit TSH receptor binding, preventing thyroid gland stimulation", "TSH stimulates thyroid follicular cells to take up iodide via NIS, which is oxidised by TPO and incorporated into thyroglobulin tyrosine residues (organification), forming MIT and DIT that are coupled to T3 and T4; thionamides (propylthiouracil, carbimazole) inhibit TPO, blocking organification and coupling, thereby reducing T3/T4 synthesis", "Thyroid hormones are synthesised entirely within lysosomes by proteolytic cleavage of a unique thyroid-specific albumin; antithyroid drugs block lysosomal acidification preventing this cleavage", "T3 and T4 are synthesised by direct covalent iodination of serum tyrosine transported into follicular cells; antithyroid drugs competitively inhibit the iodine transporter NIS rather than TPO"],
        k: 0,
        rationale: "TPO (thyroid peroxidase) catalyses both oxidation of iodide to iodine and the iodination of thyroglobulin tyrosines. PTU additionally inhibits peripheral T4→T3 conversion by deiodinase. Radioiodine (131I) destroys follicular cells by β-emission. Thyroglobulin retrieval via endocytosis and lysosomal proteolysis releases T3/T4 into blood."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular mechanism by which leptin regulates energy homeostasis?",
        options: ["Leptin is secreted by the stomach proportional to meal size and binds hypothalamic receptors to terminate individual meal episodes through short-term satiety signalling", "Leptin is secreted by white adipose tissue proportional to fat mass and acts on hypothalamic arcuate nucleus neurons: activating anorexigenic POMC/CART neurons (increasing α-MSH reducing appetite) and inhibiting orexigenic AgRP/NPY neurons, reducing food intake and increasing energy expenditure via sympathetic activation of brown adipose tissue", "Leptin acts exclusively on the liver to suppress hepatic glucose output and fatty acid synthesis, with its appetite-regulatory effects being secondary consequences of normalising metabolic fuel availability", "Leptin resistance in obesity develops because adipose tissue secretes progressively less leptin as fat mass increases, creating a deficiency state that drives hyperphagia and further weight gain"],
        k: 0,
        rationale: "LepRb (long form) in the arcuate nucleus signals via JAK2-STAT3. Common obesity involves leptin resistance (normal or high leptin but impaired signalling) — caused by endoplasmic reticulum stress, SOCS3 upregulation, impaired leptin transport across the BBB. MC4R downstream of POMC is the most common single-gene cause of human obesity."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular mechanism of glucocorticoid action and why do exogenous steroids cause so many systemic side effects?",
        options: ["Glucocorticoids act exclusively through membrane receptors using rapid non-genomic signalling; their numerous side effects result from these rapid signalling cascades in virtually every tissue within minutes of administration", "Glucocorticoids diffuse into cells and bind cytoplasmic glucocorticoid receptors (GR), causing dissociation from HSP90 and nuclear translocation; GR binds GREs activating anti-inflammatory gene transcription and transrepresses AP-1/NF-κB — explaining immunosuppression; the same ubiquitous GR expression in bone, muscle, adipose, CNS, and metabolic tissues explains the extensive side-effect profile", "Glucocorticoids are prodrugs activated exclusively in the liver; side effects result from toxic hepatic metabolites rather than direct GR-mediated effects in peripheral tissues", "Exogenous glucocorticoids work by mimicking cortisol's permissive effects on catecholamine action without any direct transcriptional mechanisms, explaining their rapid onset but not their delayed side effects"],
        k: 0,
        rationale: "GR is expressed in virtually every cell. Therapeutic transrepression of NF-κB and AP-1 requires dissociation from its co-repressors — this is the basis for 'dissociated' steroid development aiming to separate anti-inflammatory transrepression from metabolic transactivation side effects (osteoporosis, hyperglycaemia, muscle wasting, adrenal suppression, psychiatric effects)."
    },
    {
        system: "Neuroscience",
        stem: "What is the molecular basis of G-protein coupled receptor (GPCR) signal amplification and termination?",
                options: ["One activated GPCR → one activated G-protein → one effector activation → one second messenger molecule — signal is not amplified but simply transduced; termination occurs through receptor endocytosis", "One activated GPCR can activate many G-proteins (amplification 1); each Gαs activates adenylyl cyclase producing many cAMP molecules (amplification 2); each cAMP activates PKA phosphorylating many substrates (amplification 3); termination involves GRK phosphorylation of active GPCR → β-arrestin recruitment → desensitisation, internalisation, and ubiquitination", "GPCRs have intrinsic GTPase activity that self-terminates signalling within milliseconds; the β-arrestin system provides secondary amplification rather than desensitisation", "GPCR signalling is a simple binary on/off switch with no cascade amplification; the diversity of cellular responses reflects differential G-protein expression rather than signal amplification"],
        k: 0,
        rationale: "This cascade amplification is fundamental to hormonal pharmacology. The GTPase activity of Gα (slow intrinsic rate accelerated by RGS proteins) terminates Gα signalling. GRK1-7 phosphorylate activated GPCRs; β-arrestin not only desensitises but scaffolds its own signalling complexes — biased agonism exploits this to achieve G-protein signalling without β-arrestin-mediated side effects."
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
   
   
