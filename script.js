/* ==========================================================================
   1. STATE ENGINE & DOM SELECTORS
   ========================================================================== */
const AppState = {
    mode: 'formative',
    currentIndex: 0,
    score: 0,
    timer: null,
    timeLeft: 20,
    selectedOption: null,
    isLocked: false,
    activeSessionBank: [],
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
   2. TIMER & GAME LOOP LOGIC
   ========================================================================== */
function startTimer() {
    clearInterval(AppState.timer);
    AppState.timeLeft = 20;
    DOM.hud.timerReadout.innerText = "20s";
    DOM.hud.timerBadge.className = "hud-timer-badge";

    AppState.timer = setInterval(() => {
        AppState.timeLeft--;
        DOM.hud.timerReadout.innerText = `${AppState.timeLeft}s`;

        if (AppState.timeLeft === 5) DOM.hud.timerBadge.classList.add('timer-warning');
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
        DOM.drawer.pill.className = "verdict-pill is-wrong";
        DOM.drawer.pill.innerText = "⏱️ Time's Up!";
        DOM.drawer.text.innerHTML = `<strong>Too slow!</strong> The best answer was: <em>"${currentItem.options[currentItem.correct]}"</em>.<br><br>${currentItem.rationale}`;
        DOM.drawer.container.style.display = 'block';
        showNavigation();
    } else {
        setTimeout(advanceItem, 1500);
    }
}

function shuffleInternalBank(sourceBank) {
    let clone = [...sourceBank];
    for (let i = clone.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [clone[i], clone[j]] = [clone[j], clone[i]];
    }
    return clone;
}

function initializeAssessment() {
    AppState.mode = DOM.controls.modeSelect.value;
    
    // Shuffles the giant master pool of 150, strictly slices out 20 for the user!
    const fullyShuffledMaster = shuffleInternalBank(INTERNAL_MASTER_BANK);
    AppState.activeSessionBank = fullyShuffledMaster.slice(0, 20);
    
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
    DOM.hud.progressBar.style.width = `${((AppState.currentIndex + 1) / 20) * 100}%`;

    DOM.stage.stem.innerText = currentQ.stem;
    DOM.stage.matrix.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];

    currentQ.options.forEach((optText, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quiz-option';
        btn.setAttribute('role', 'radio');
        btn.innerHTML = `<span class="option-index-key">${letters[idx]}</span><span>${optText}</span>`;
        btn.addEventListener('click', () => selectOption(idx, btn));
        DOM.stage.matrix.appendChild(btn);
    });

    startTimer();
}

function selectOption(idx, btn) {
    if (AppState.isLocked) return;
    DOM.stage.matrix.querySelectorAll('.quiz-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
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
    if (AppState.currentIndex < 19) DOM.controls.nextBtn.classList.remove('hidden');
    else DOM.controls.finalizeBtn.classList.remove('hidden');
}

function advanceItem() {
    if (AppState.currentIndex < 19) {
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

// Open Master Question Collection
const INTERNAL_MASTER_BANK = [
    /* ==========================================================================
       QUESTIONS 001 - 025: THE SKELETAL SYSTEM (Amazing Bones!)
       ========================================================================== */
    {
        system: "Bones & Skeleton",
        stem: "How many bones are in a fully grown adult human body?",
        options: ["150 bones", "206 bones", "300 bones", "512 bones"],
        correct: 1,
        rationale: "Babies are actually born with around 300 bones! As you grow up, many of these tiny bones fuse together to give an adult exactly 206 hard bones."
    },
    {
        system: "Bones & Skeleton",
        stem: "Which bone is the longest, strongest, and heaviest bone in your entire body?",
        options: ["Shinbone (Tibia)", "Arm bone (Humerus)", "Thighbone (Femur)", "Backbone (Spine)"],
        correct: 2,
        rationale: "Your femur (thighbone) is super strong! It can support up to 30 times the weight of your own body."
    },
    {
        system: "Bones & Skeleton",
        stem: "Where in your body can you find the smallest and tiniest bone, called the 'stapes' or stirrup?",
        options: ["Inside your pinky toe", "Inside your deep ear", "Inside your nose tip", "Under your fingernail"],
        correct: 1,
        rationale: "The stapes is hidden deep inside your middle ear. It is smaller than a single grain of rice and helps vibrate sound waves so you can hear!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the fun common name for the 'clavicle' bone that sits right across the top of your chest?",
        options: ["Wishbone", "Collarbone", "Funny bone", "Breastbone"],
        correct: 1,
        rationale: "Your collarbone acts like a sturdy bridge connecting your shoulder to the center of your chest. It's the most commonly broken bone in young explorers!"
    },
    {
        system: "Bones & Skeleton",
        stem: "Which bone acts like a hard built-in helmet to keep your brain safe and cozy?",
        options: ["Ribcage", "Pelvis", "Cranium (Skull)", "Patella"],
        correct: 2,
        rationale: "The cranium is made of several flat bones that fit together like a 3D jigsaw puzzle to build a protective vault around your brain."
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the primary job of your flexible ribcage?",
        options: ["To help you digest food", "To protect your heart and lungs", "To keep your head standing upright", "To store extra water"],
        correct: 1,
        rationale: "Your ribs form a strong, flexible cage that breathes in and out while shielding your vital heart and lungs from bumps and falls."
    },
    {
        system: "Bones & Skeleton",
        stem: "What special jelly-like substance lives inside the center of your big bones and makes fresh red blood cells?",
        options: ["Bone marrow", "Cartilage", "Joint fluid", "Adrenaline"],
        correct: 0,
        rationale: "Bone marrow is like a busy microscopic factory inside your bones. It pumps out millions of fresh blood cells every single second!"
    },
    {
        system: "Bones & Skeleton",
        stem: "Which nutrient from foods like milk, cheese, and broccoli is super famous for building hard, strong bones?",
        options: ["Vitamin C", "Iron", "Calcium", "Sugar"],
        correct: 2,
        rationale: "Calcium is the hard mineral that gives bones their concrete-like strength. Pair it with Vitamin D from sunshine to absorb it even faster!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What do we call the special connection spots where two different bones meet and allow you to bend?",
        options: ["Tendons", "Joints", "Muscles", "Nerves"],
        correct: 1,
        rationale: "Without joints, you would be as stiff as a wooden robot! Joints let you wiggle your fingers, bend your knees, and nod your head."
    },
    {
        system: "Bones & Skeleton",
        stem: "Your knee has a special shield bone that floats right over the joint. What is its proper anatomy name?",
        options: ["Patella", "Fibula", "Scapula", "Mandible"],
        correct: 0,
        rationale: "The patella (kneecap) protects your knee tendon and acts like a pulley to give your leg muscles extra kicking leverage."
    },
    {
        system: "Bones & Skeleton",
        stem: "Which bone is the ONLY bone in your entire skull that can move up and down so you can talk and chew?",
        options: ["Nose bone", "Upper jaw (Maxilla)", "Lower jaw (Mandible)", "Cheekbone"],
        correct: 2,
        rationale: "All the other bones in your skull are locked down tight. Only your mandible swings on a hinge joint so you can chomp your favorite foods!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What kind of joint is found in your shoulder and hip, letting you swing your arms and legs in a complete 360-degree circle?",
        options: ["Hinge joint", "Pivot joint", "Ball-and-socket joint", "Gliding joint"],
        correct: 2,
        rationale: "A round bone head fits snugly into a cup-shaped socket, giving your shoulders and hips the freest range of motion in the whole animal kingdom!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the medical name for the stack of 33 ring-shaped bones that run down the middle of your back?",
        options: ["Vertebral column (Spine)", "Sternum", "Phalanges", "Carpals"],
        correct: 0,
        rationale: "Your spine acts like a flexible telephone pole. It keeps you standing tall while shielding the main highway of nerves traveling down your back."
    },
    {
        system: "Bones & Skeleton",
        stem: "When you accidentally hit your elbow and get a weird, tingly shock, what are you actually bumping?",
        options: ["Your true funny bone", "The ulnar nerve", "A blood vessel", "Your elbow cap"],
        correct: 1,
        rationale: "There is no actual 'funny bone'! You are accidentally squishing the sensitive ulnar nerve against the hard humerus bone."
    },
    {
        system: "Bones & Skeleton",
        stem: "What smooth, rubbery material covers the ends of your bones so they don't grind together painfully?",
        options: ["Skin", "Cartilage", "Fat", "Hair"],
        correct: 1,
        rationale: "Cartilage is super slippery and tough. It's the same flexible material that gives your outer ears and the tip of your nose their shape!"
    },
    {
        system: "Bones & Skeleton",
        stem: "Which bone sits right in the middle of your chest, connecting your ribs together like a zipper?",
        options: ["Sternum", "Clavicle", "Radius", "Ulna"],
        correct: 0,
        rationale: "The sternum (breastbone) shaped a bit like a flat necktie. It protects your heart right behind it."
    },
    {
        system: "Bones & Skeleton",
        stem: "What do we call the tiny bones that make up your fingers and your toes?",
        options: ["Metatarsals", "Phalanges", "Tarsals", "Carpals"],
        correct: 1,
        rationale: "You have 14 phalanges in each hand and 14 in each foot. Your thumb and big toe get two, while the rest of your digits get three!"
    },
    {
        system: "Bones & Skeleton",
        stem: "Which two parallel bones live side-by-side inside your forearm?",
        options: ["Femur and Tibia", "Radius and Ulna", "Talus and Calcaneus", "Atlas and Axis"],
        correct: 1,
        rationale: "The radius connects toward your thumb side, while the ulna sits on your pinky side. They cross over each other when you flip your hand over!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What tough, stretchy bands of tissue act like strong rubber bands to tie one bone directly to another bone across a joint?",
        options: ["Ligaments", "Tendons", "Veins", "Arteries"],
        correct: 0,
        rationale: "Remember this easy rule: Ligaments link Bone-to-Bone, while Tendons tie Muscle-to-Bone!"
    },
    {
        system: "Bones & Skeleton",
        stem: "Why are birds' bones naturally hollow, while human bones are heavy and packed solid?",
        options: ["To store extra air for breathing", "To make them light enough to fly", "Because birds don't drink milk", "To help them swim faster"],
        correct: 1,
        rationale: "Bird skeletons have special air pockets inside them to keep their weight super low so they can soar through the sky easily!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What do we call the big, bowl-shaped ring of bones at the base of your spine that cradles your tummy organs?",
        options: ["Scapula", "Pelvis", "Cranium", "Thorax"],
        correct: 1,
        rationale: "Your pelvis connects your upper body down to your legs. A human runner's pelvis is specially tilted to help us balance on two feet!"
    },
    {
        system: "Bones & Skeleton",
        stem: "Which of these bones is located in your lower leg alongside your shinbone?",
        options: ["Humerus", "Fibula", "Radius", "Ulna"],
        correct: 1,
        rationale: "The fibula is the skinny bone sitting on the outside of your lower leg. It doesn't carry much weight, but it's great for anchoring ankle muscles!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the name of the very top vertebra bone in your neck that holds up your entire head?",
        options: ["Atlas", "Axis", "Stapes", "Coccyx"],
        correct: 0,
        rationale: "Named after Atlas from ancient Greek mythology (who held the whole world on his shoulders), this ring bone lets you nod your head 'Yes'!"
    },
    {
        system: "Bones & Skeleton",
        stem: "What is the proper name for your funny little tailbone hidden at the very bottom of your spine?",
        options: ["Sacrum", "Coccyx", "Pubis", "Ischium"],
        correct: 1,
        rationale: "The coccyx is made of 3 to 5 tiny fused bones. It's the leftover trace of the tail our ancient evolutionary ancestors used to swing around!"
    },
    {
        system: "Bones & Skeleton",
        stem: "Which flat, triangular bones slide around on your upper back when you shrug your shoulders?",
        options: ["Scapulae (Shoulder blades)", "Clavicles", "Ribs", "Sternums"],
        correct: 0,
        rationale: "Your shoulder blades act like giant mobile platforms on your back, giving your powerful arm muscles a wide base to pull against."
    },
    /* ==========================================================================
       QUESTIONS 026 - 050: THE MUSCULAR SYSTEM (Super Strengths!)
       ========================================================================== */
    {
        system: "Muscles & Strength",
        stem: "Roughly how many distinct skeletal muscles do you use to move your body every day?",
        options: ["Over 100 muscles", "Over 600 muscles", "Over 1,000 muscles", "Exactly 206 muscles"],
        correct: 1,
        rationale: "You have over 600 skeletal muscles! They make up about 40% of your total body weight and help you do everything from blinking to jumping."
    },
    {
        system: "Muscles & Strength",
        stem: "Which muscle in the human body is the absolute STRONGEST based on how hard it can squeeze?",
        options: ["Biceps (Arm)", "Masseter (Jaw)", "Quadriceps (Thigh)", "Gluteus Maximus (Bottom)"],
        correct: 1,
        rationale: "Your masseter is the main muscle you use to chew food. When you bite down hard, it can squeeze with a force of over 200 pounds!"
    },
    {
        system: "Muscles & Strength",
        stem: "Which muscle is the BIGGEST and most massive muscle in your entire body?",
        options: ["Latissimus Dorsi (Back)", "Gluteus Maximus (Bottom)", "Pectoralis Major (Chest)", "Gastrocnemius (Calf)"],
        correct: 1,
        rationale: "Your gluteus maximus is your big butt muscle! It has to be huge and powerful because its main job is keeping your entire upper body standing upright."
    },
    {
        system: "Muscles & Strength",
        stem: "What is the only muscle in your body that works non-stop, 24 hours a day, without ever getting tired?",
        options: ["The Cardiac Muscle (Heart)", "The Diaphragm (Breathing)", "The Eyelid Muscle", "The Tongue"],
        correct: 0,
        rationale: "Your heart is made of a special 'cardiac muscle' that contains massive amounts of energy factories (mitochondria). It beats over 100,000 times a day!"
    },
    {
        system: "Muscles & Strength",
        stem: "When you want to show off your arm strength and 'flex', which muscle pops up like a little mountain?",
        options: ["Triceps Brachii", "Deltoid", "Biceps Brachii", "Forearm Flexor"],
        correct: 2,
        rationale: "The word 'biceps' actually means 'two heads' in Latin because it's made of two muscle bundles working together to bend your elbow!"
    },
    {
        system: "Muscles & Strength",
        stem: "Which muscle group on the front of your thigh is made of FOUR powerful muscles working together to help you kick a ball?",
        options: ["Hamstrings", "Quadriceps", "Calf Muscles", "Abdominals"],
        correct: 1,
        rationale: "The prefix 'Quad' means four! These four strong muscles straighten your knee so you can run, jump, and climb stairs."
    },
    {
        system: "Muscles & Strength",
        stem: "What do we call the strong, rope-like cords that attach your muscles directly to your bones?",
        options: ["Ligaments", "Cartilage", "Tendons", "Nerves"],
        correct: 2,
        rationale: "Tendons are super tough and inelastic. When your muscle belly contracts and gets shorter, it pulls on the tendon like a puppet string to move your bone!"
    },
    {
        system: "Muscles & Strength",
        stem: "Which famous tendon at the back of your ankle is named after a legendary, invincible Greek hero?",
        options: ["Hercules Tendon", "Achilles Tendon", "Spartan Tendon", "Titan Tendon"],
        correct: 1,
        rationale: "The Achilles tendon is the thickest and strongest tendon in your body. It connects your calf muscles to your heel so you can push off the ground to run!"
    },
    {
        system: "Muscles & Strength",
        stem: "Which muscle acts like an umbrella floor beneath your lungs and pulls down flat to help you breathe in air?",
        options: ["Intercostals", "Abdominals", "Diaphragm", "Trapezius"],
        correct: 2,
        rationale: "Your diaphragm does most of the hard work when you breathe. When it gets irritated and spasms, you get the hiccups!"
    },
    {
        system: "Muscles & Strength",
        stem: "What is the fun common nickname for your 'Rectus Abdominis' muscles on the front of your tummy?",
        options: ["The Six-Pack", "The Side Bends", "The Core Ropes", "The Belly Bands"],
        correct: 0,
        rationale: "Strong fibrous bands cross over this flat tummy muscle horizontally, creating the famous bumpy 'six-pack' look on gymnasts and athletes!"
    },
    {
        system: "Muscles & Strength",
        stem: "Which muscle covers the top of your shoulder like a round shoulder pad and helps you lift your arm out to the side?",
        options: ["Trapezius", "Deltoid", "Pectoralis Major", "Rhomboid"],
        correct: 1,
        rationale: "The deltoid gets its name because it is shaped like the ancient Greek letter Delta (Δ), which looks like a triangle!"
    },
    {
        system: "Muscles & Strength",
        stem: "When you smile, you actually use about 17 muscles! Which muscle loops completely around your mouth to help you pucker up for a kiss?",
        options: ["Zygomaticus", "Orbicularis Oris", "Buccinator", "Risorius"],
        correct: 1,
        rationale: "Orbicularis means 'circular'! You have circular sphincter muscles like this around your mouth for kissing and eating, and around your eyes for winking."
    },
    {
        system: "Muscles & Strength",
        stem: "Muscles can only PULL bones; they can never PUSH! Because of this, how do muscles usually work to move your joints back and forth?",
        options: ["In competing pairs", "Completely alone", "In groups of ten", "Only when you are awake"],
        correct: 0,
        rationale: "Muscles act like best friends sharing a seesaw! When your biceps pulls to bend your arm, your triceps relaxes. To straighten it back out, the triceps pulls while the biceps relaxes."
    },
    {
        system: "Muscles & Strength",
        stem: "What do your muscles naturally produce when you shiver on a cold winter day?",
        options: ["Extra fat", "Body heat", "Electricity", "Vitamin D"],
        correct: 1,
        rationale: "Shivering is actually your brain's clever emergency heating system! Your muscles twitch rapidly back and forth to generate warm body heat."
    },
    {
        system: "Muscles & Strength",
        stem: "Which broad, fan-shaped muscles sit right across your chest and give athletes pushing power for push-ups?",
        options: ["Pectoralis Major (Pecs)", "Latissimus Dorsi (Lats)", "Obliques", "Serratus Anterior"],
        correct: 0,
        rationale: "Your 'pecs' connect your collarbone and breastbone to your upper arm, letting you push heavy doors open and give giant bear hugs!"
    },
    {
        system: "Muscles & Strength",
        stem: "What happens to your skeletal muscles when you exercise them regularly and eat protein?",
        options: ["They grow more bones inside them", "The individual muscle fibers get thicker and stronger", "They turn into permanent cartilage", "They multiply into thousands of new muscles"],
        correct: 1,
        rationale: "You don't actually grow new muscle fibers when you work out! Instead, the microscopic muscle threads you already have pack in more protein to become thicker and stronger."
    },
    {
        system: "Muscles & Strength",
        stem: "Which group of three powerful muscles runs down the back of your thigh and helps you bend your knee?",
        options: ["Hamstrings", "Quadriceps", "Calf Muscles", "Glutes"],
        correct: 0,
        rationale: "Long ago, butchers used to hang up cured hams by the strong ropes at the back of the pig's knee—which is how human 'hamstrings' got their funny name!"
    },
    {
        system: "Muscles & Strength",
        stem: "What is the fastest-moving muscle in your entire body, reacting in less than 1/100th of a second?",
        options: ["Your tongue muscle", "The orbicularis oculi (eyelid blinker)", "Your finger pointer", "Your heart valve"],
        correct: 1,
        rationale: "Your eyelid blink muscle is lightning fast! It snaps shut instantly to protect your precious eyes from flying dust and bright flashes."
    },
    {
        system: "Muscles & Strength",
        stem: "Which type of muscle works completely automatically inside your stomach and intestines to push your food along?",
        options: ["Skeletal muscle", "Smooth muscle", "Voluntary muscle", "Bicep muscle"],
        correct: 1,
        rationale: "Smooth muscle works entirely on 'autopilot' managed by your subconscious brain. You don't have to think at all to make your stomach digest lunch!"
    },
    {
        system: "Muscles & Strength",
        stem: "Which broad, flat muscle covers your upper back and neck, letting you look up at the stars and shrug your shoulders?",
        options: ["Trapezius", "Latissimus Dorsi", "Deltoid", "Rhomboid"],
        correct: 0,
        rationale: "This massive muscle looks like a giant diamond or trapezoid shape stretching from the back of your skull all the way down to the middle of your spine!"
    },
    {
        system: "Muscles & Strength",
        stem: "Why do your muscles sometimes feel sore or tired the day after running a super long race?",
        options: ["Your bones are shrinking", "Tiny microscopic micro-tears form in the muscle fibers", "Your tendons turn into liquid", "You ran out of red blood cells"],
        correct: 1,
        rationale: "Don't worry, muscle soreness is normal! Those tiny micro-tears heal over the next two days, rebuilding the muscle even stronger than it was before."
    },
    {
        system: "Muscles & Strength",
        stem: "Which muscle is super flexible, contains eight different woven muscle sections, and helps you taste delicious ice cream?",
        options: ["The Tongue", "The Epiglottis", "The Uvula", "The Esophagus"],
        correct: 0,
        rationale: "Your tongue is actually a muscular hydrostat—just like an elephant's trunk or an octopus tentacle! It has no bones inside it at all, allowing it to twist into any shape."
    },
    {
        system: "Muscles & Strength",
        stem: "What fuel do your muscle factories burn alongside oxygen to create explosive physical energy?",
        options: ["Glucose (Blood Sugar)", "Pure water", "Carbon dioxide", "Calcium mineral"],
        correct: 0,
        rationale: "Your digestion breaks down yummy carbs from pasta, fruit, and bread into simple glucose. Muscles store this sugar inside them like tiny charged batteries!"
    },
    {
        system: "Muscles & Strength",
        stem: "Which diagonal muscle is the longest single muscle in your body, crossing from your outer hip all the way down to your inner knee?",
        options: ["Sartorius", "Gracilis", "Adductor Longus", "Tensor Fasciae Latae"],
        correct: 0,
        rationale: "Nicknamed the 'tailor's muscle', the ribbon-like sartorius helps you sit cross-legged on the floor just like ancient clothing tailors used to do!"
    },
    {
        system: "Muscles & Strength",
        stem: "When you stand on your tiptoes to reach a high shelf, which big muscle on the back of your lower leg does the lifting?",
        options: ["Gastrocnemius (Calf)", "Tibialis Anterior (Shin)", "Hamstring", "Soleus"],
        correct: 0,
        rationale: "Your gastrocnemius forms the thick, diamond-shaped bulge of your calf. Dancers and basketball players have super strong calves for leaping!"
    },
    /* ==========================================================================
       QUESTIONS 051 - 075: HEART & LUNGS (The Lifeline Pumps!)
       ========================================================================== */
    {
        system: "Heart & Lungs",
        stem: "About how big is your amazing, non-stop beating heart?",
        options: ["The size of a smartphone", "The size of your clenched fist", "The size of a basketball", "The size of a single grape"],
        correct: 1,
        rationale: "Your heart grows right along with you! At any age, your heart is roughly the same size as your closed fist, sitting snugly right in the middle of your chest."
    },
    {
        system: "Heart & Lungs",
        stem: "Which side of your heart is the powerhouse that pumps fresh, bright red oxygen-rich blood out to your whole body?",
        options: ["The left side", "The right side", "The top side", "The bottom side"],
        correct: 0,
        rationale: "The left side of your heart has extra thick, strong muscle walls because its job is to push blood all the way from your brain down to your tiptoes!"
    },
    {
        system: "Heart & Lungs",
        stem: "What are the millions of microscopic, stretchy balloon-like air sacs inside your lungs called?",
        options: ["Bronchi", "Alveoli", "Capillaries", "Ventricles"],
        correct: 1,
        rationale: "Alveoli are magical tiny air bags! Your lungs have about 600 million of them, swapping fresh oxygen into your blood and pulling waste gas out every time you breathe."
    },
    {
        system: "Heart & Lungs",
        stem: "What super-important element does your blood gather from the air inside your lungs to keep your cells alive?",
        options: ["Nitrogen", "Carbon dioxide", "Oxygen", "Hydrogen"],
        correct: 2,
        rationale: "Oxygen is the magical fuel your cells need to create energy! Your lungs capture it from the air, and your blood distributes it like a high-speed delivery train."
    },
    {
        system: "Heart & Lungs",
        stem: "Some old textbooks make veins look bright blue. What color is your blood actually inside your body before it touches air?",
        options: ["Bright neon blue", "Dark, deep maroon red", "Clear like water", "Dark green"],
        correct: 1,
        rationale: "Human blood is NEVER blue! When blood is running low on oxygen inside your veins, it turns a deep, dark maroon red. It only looks blueish through your skin because of how light waves bend!"
    },
    {
        system: "Heart & Lungs",
        stem: "What is the name of the waste gas that your body cells produce and your lungs breathe out into the air?",
        options: ["Oxygen", "Carbon dioxide", "Helium", "Methane"],
        correct: 1,
        rationale: "Carbon dioxide (CO2) is the exhaust gas your body makes when it burns energy. Trees and plants love it, absorbing the CO2 you breathe out to create fresh oxygen for us!"
    },
    {
        system: "Heart & Lungs",
        stem: "Humans have two lungs to help them breathe. Why is your left lung shaped slightly different and smaller than your right lung?",
        options: ["To make extra room for your stomach", "To make room for your heart to sit safely", "To leave space for your left arm to move", "Because it is younger than the right lung"],
        correct: 1,
        rationale: "Your heart leans slightly over to the left side of your chest. Your left lung features a special indentation called the 'cardiac notch' so the heart can nestle in perfectly!"
    },
    {
        system: "Heart & Lungs",
        stem: "What do we call the strong, thick highway tubes that carry blood AWAY from the heart out to the body?",
        options: ["Arteries", "Veins", "Capillaries", "Nerves"],
        correct: 0,
        rationale: "Remember this easy word game: **A**rteries carry blood **A**way! Because the heart shoots blood into them with a powerful squeeze, arteries have thick, bouncy walls."
    },
    {
        system: "Heart & Lungs",
        stem: "What do we call the delivery tubes that carry tired blood back HOME to your heart?",
        options: ["Arteries", "Veins", "Tendons", "Lymph nodes"],
        correct: 1,
        rationale: "Veins carry blood back to the heart. They contain clever one-way trapdoors called valves that stop blood from falling backward down your legs due to gravity!"
    },
    {
        system: "Heart & Lungs",
        stem: "What are the absolute tiniest, microscopic blood vessels that connect your arteries to your veins called?",
        options: ["Aortas", "Capillaries", "Vena cavas", "Bronchioles"],
        correct: 1,
        rationale: "Capillaries are so narrow that red blood cells have to slide through them in a single-file line! This slow speed lets them unload oxygen directly to neighboring cells."
    },
    {
        system: "Heart & Lungs",
        stem: "Which special type of blood cell acts like a cargo delivery truck to ferry oxygen around your body?",
        options: ["White blood cells", "Red blood cells", "Platelets", "Plasma cells"],
        correct: 1,
        rationale: "Red blood cells are packed with a special iron protein called hemoglobin that grabs onto oxygen molecules like a magnetic glove!"
    },
    {
        system: "Heart & Lungs",
        stem: "Which brave blood cells act like your body's personal microscopic security guards to fight off germs and viruses?",
        options: ["Red blood cells", "White blood cells", "Platelets", "Hormones"],
        correct: 1,
        rationale: "White blood cells are real-life superheroes! When germs enter a scrape, white blood cells rush to the scene, swallow up bad bacteria, and heal you."
    },
    {
        system: "Heart & Lungs",
        stem: "When you get a small papercut, what tiny cellular fragments clamp together like a sticky band-aid to stop the bleeding?",
        options: ["Platelets", "White cells", "Plasma", "Red cells"],
        correct: 0,
        rationale: "Platelets are awesome plug-makers! The moment a blood vessel breaks, platelets rush over, link arms, and create a net to build a protective scab."
    },
    {
        system: "Heart & Lungs",
        stem: "Blood isn't completely solid red; it's mostly liquid! What is the clear, yellowish watery fluid that carries all your blood cells along?",
        options: ["Plasma", "Marrow", "Saliva", "Lymph"],
        correct: 0,
        rationale: "Plasma makes up more than half of your total blood volume. It is mostly water, packed with dissolved vitamins, minerals, and sugars to nourish your organs."
    },
    {
        system: "Heart & Lungs",
        stem: "What is the proper anatomy name for your sturdy main windpipe that channels air down your throat?",
        options: ["Esophagus", "Trachea", "Larynx", "Pharynx"],
        correct: 1,
        rationale: "Your trachea is reinforced with stiff, C-shaped rings of cartilage so it stays wide open like a vacuum hose, ensuring air can always flow freely."
    },
    {
        system: "Heart & Lungs",
        stem: "What is the proper name for your built-in 'voice box' that vibrates when you sing, talk, or hum?",
        options: ["Larynx", "Trachea", "Bronchus", "Alveolus"],
        correct: 0,
        rationale: "Your larynx holds two stretchy bands called vocal cords. When you exhale air past them, they vibrate like guitar strings to produce sounds!"
    },
    {
        system: "Heart & Lungs",
        stem: "What clever little trapdoor flap folds down over your windpipe when you swallow food so you don't accidentally choke?",
        options: ["The Uvula", "The Epiglottis", "The Tonsil", "The Palate"],
        correct: 1,
        rationale: "The epiglottis acts like an amazing traffic cop! When you breathe, it stands open. When you gulp food or water, it snaps shut instantly to redirect dinner safely down your food pipe."
    },
    {
        system: "Heart & Lungs",
        stem: "When you check your pulse at your wrist or neck, what are you actually feeling?",
        options: ["Your nerves sending signals", "Your artery expanding with every heartbeat", "Your lungs expanding with air", "Your bones vibrating"],
        correct: 1,
        rationale: "Every single time your heart squeezes, it shoots a wave of high-pressure blood through your arterial highways, causing the vessels to bounce rhythmically!"
    },
    {
        system: "Heart & Lungs",
        stem: "What is the name of the absolute largest, thickest artery arching right out of the top of your heart?",
        options: ["The Vena Cava", "The Aorta", "The Pulmonary Artery", "The Jugular vein"],
        correct: 1,
        rationale: "The aorta is as thick as a garden hose! It serves as the primary distribution trunk that all other systemic arteries branch off of."
    },
    {
        system: "Heart & Lungs",
        stem: "Your airways are lined with millions of microscopic, sweeping hair-like structures. What are they called?",
        options: ["Cilia", "Villi", "Flagella", "Tendrils"],
        correct: 0,
        rationale: "Cilia act like tiny, coordinated brooms! They wave back and forth non-stop to sweep dust, pollen, and germs up and out of your lungs so your airways stay clean."
    },
    {
        system: "Heart & Lungs",
        stem: "How many internal rooms or 'chambers' are built inside a human heart to sort blood?",
        options: ["Two chambers", "Three chambers", "Four chambers", "Six chambers"],
        correct: 2,
        rationale: "Your heart features four chambers: two at the top (Atria) to catch incoming blood, and two heavy muscular pump rooms at the bottom (Ventricles) to shoot blood out!"
    },
    {
        system: "Heart & Lungs",
        stem: "When a doctor listens to your chest with a stethoscope, they hear a rhythmic 'lub-dub, lub-dub' sound. What makes that sound?",
        options: ["Your heart muscle hitting your ribs", "The internal heart valves snapping shut cleanly", "Air rushing into your lungs", "Blood splashing against the stomach"],
        correct: 1,
        rationale: "Your heart uses four one-way doors (valves) to keep blood moving forward. The 'lub-dub' sound is the acoustic snap of these doors slamming shut to lock blood into place!"
    },
    {
        system: "Heart & Lungs",
        stem: "What kind of exercise is famous for making your heart and lung muscles super strong and efficient?",
        options: ["Sleeping", "Aerobic exercise (Cardio like running and swimming)", "Video gaming", "Stretching your fingers"],
        correct: 1,
        rationale: "Cardio exercise trains your heart to pump more blood with less effort and helps your lungs absorb more oxygen, giving you superstar stamina!"
    },
    {
        system: "Heart & Lungs",
        stem: "Where does blood go the absolute moment it leaves the right side of your heart?",
        options: ["Straight to your brain", "Straight to your lungs to pick up oxygen", "Down to your stomach", "Into your arm muscles"],
        correct: 1,
        rationale: "The right side of your heart collects tired, low-oxygen blood from your body and instantly sends it on a short trip over to the lungs to swap out carbon dioxide for a fresh batch of oxygen!"
    },
    {
        system: "Heart & Lungs",
        stem: "About how many times does an average kid's heart beat every single minute while resting peacefully?",
        options: ["10 to 20 times", "30 to 50 times", "70 to 100 times", "Over 300 times"],
        correct: 2,
        rationale: "A resting heart rate of 70 to 100 beats per minute is perfect for young explorers! When you sprint or play soccer, it beats even faster to speed up fuel deliveries."
    },
    /* ==========================================================================
       QUESTIONS 076 - 100: THE DIGESTIVE SYSTEM (The Food Journey!)
       ========================================================================== */
    {
        system: "Digestion & Food",
        stem: "Where does the amazing process of digestion officially begin?",
        options: ["In your stomach", "In your mouth", "In your small intestine", "In your throat"],
        correct: 1,
        rationale: "Digestion starts the moment you take a bite! Your saliva contains special enzymes that instantly begin breaking down complex starches into simple sugars while your teeth chew."
    },
    {
        system: "Digestion & Food",
        stem: "What is the name of the muscular food pipe that squeezes food down from your throat into your stomach?",
        options: ["Trachea", "Esophagus", "Ureter", "Bronchus"],
        correct: 1,
        rationale: "The esophagus uses wave-like muscle contractions called peristalsis to push food down. It's so powerful that it can even push food to your stomach if you were upside down!"
    },
    {
        system: "Digestion & Food",
        stem: "Your stomach releases a super strong liquid to break down food and kill bad bacteria. What is this liquid?",
        options: ["Saliva", "Gastric Acid (Hydrochloric acid)", "Bile", "Insulin"],
        correct: 1,
        rationale: "Your stomach acid is incredibly strong! It is strong enough to dissolve metal, but a thick layer of slimy mucus protects your stomach walls from getting burned by its own juices."
    },
    {
        system: "Digestion & Food",
        stem: "Despite its name, which part of the digestive tract is actually the LONGEST, stretching over 20 feet long inside an adult?",
        options: ["The Stomach", "The Large Intestine", "The Small Intestine", "The Esophagus"],
        correct: 2,
        rationale: "It is called 'small' only because it is narrow! It is tightly folded up inside your abdomen and absorbs nearly all the nutrients and vitamins from your food."
    },
    {
        system: "Digestion & Food",
        stem: "What is the primary job of the wide, shorter 'Large Intestine'?",
        options: ["To chew your food into pieces", "To absorb extra water and pack away solid waste", "To make bile fluid", "To mix food with strong acids"],
        correct: 1,
        rationale: "By the time food hits the large intestine, most nutrients are gone. It acts like a recycling center, soaking up leftover water so your body stays hydrated."
    },
    {
        system: "Digestion & Food",
        stem: "Which large, heavy organ acts like a busy chemical factory to clean your blood, process nutrients, and destroy toxins?",
        options: ["The Spleen", "The Gallbladder", "The Liver", "The Pancreas"],
        correct: 2,
        rationale: "Your liver is a multi-tasking superstar performing over 500 different jobs at once! It filters everything you absorb from food before letting it reach the rest of your body."
    },
    {
        system: "Digestion & Food",
        stem: "What is the name of the green, soapy fluid made by the liver that breaks down big grease drops from fatty foods?",
        options: ["Saliva", "Bile", "Chyme", "Mucus"],
        correct: 1,
        rationale: "Bile acts exactly like dishwashing soap! It emulsifies big fat globs from foods like pizza or butter into tiny droplets so your enzymes can digest them easily."
    },
    {
        system: "Digestion & Food",
        stem: "Where does your body store extra bile fluid until you eat a fatty meal that needs digesting?",
        options: ["In the Appendix", "In the Gallbladder", "In the Spleen", "In the Urinary Bladder"],
        correct: 1,
        rationale: "The gallbladder is a small, pear-shaped pouch tucked right underneath your liver. It squeezes its stored bile into the small intestine whenever fat arrives."
    },
    {
        system: "Digestion & Food",
        stem: "Which leaf-shaped organ hides behind your stomach and creates juices to digest food while making insulin to manage your sugar levels?",
        options: ["The Kidney", "The Pancreas", "The Liver", "The Thyroid"],
        correct: 1,
        rationale: "The pancreas is an essential dual-action organ! It pumps powerful digestive enzymes into your intestines and shoots metabolic hormones into your bloodstream."
    },
    {
        system: "Digestion & Food",
        stem: "The inner walls of your small intestine are covered in millions of tiny, velvety hair-like bumps that soak up nutrients. What are they called?",
        options: ["Cilia", "Villi", "Flagella", "Pores"],
        correct: 1,
        rationale: "Villi act like millions of tiny, absorbent sponges! They give your small intestine a massive surface area—roughly the size of a whole tennis court!"
    },
    {
        system: "Digestion & Food",
        stem: "What do your salivary glands produce to wet your food and make it slick enough to slide down your throat safely?",
        options: ["Bile", "Saliva (Spit)", "Acid", "Plasma"],
        correct: 1,
        rationale: "You produce about 1 to 2 liters of saliva every single day! It protects your mouth, fights germs, and initiates the food breakdown process."
    },
    {
        system: "Digestion & Food",
        stem: "What do we call the thick, soupy mixture of mashed food and stomach acid that leaves your stomach?",
        options: ["Bolus", "Chyme", "Bile", "Plasma"],
        correct: 1,
        rationale: "When you swallow food, it is called a bolus. After your stomach churns and mashes it for a few hours with acid, it turns into a liquid soup called chyme."
    },
    {
        system: "Digestion & Food",
        stem: "What is the name of the tiny, finger-shaped pouch attached to the start of your large intestine that sometimes gets irritated and needs to be surgically removed?",
        options: ["The Gallbladder", "The Appendix", "The Spleen", "The Tonsil"],
        correct: 1,
        rationale: "The appendix is a small tube. While it was long thought to be useless, scientists now believe it acts like a safe-house storage box for good gut bacteria!"
    },
    {
        system: "Digestion & Food",
        stem: "How long does it typically take for a meal to travel all the way through your entire digestive system from start to finish?",
        options: ["About 10 to 20 minutes", "About 1 to 2 hours", "About 24 to 72 hours", "Exactly one week"],
        correct: 2,
        rationale: "Digestion is a slow, careful process! While food leaves your stomach in a few hours, it takes up to three days to finish its complete winding journey through your long intestines."
    },
    {
        system: "Digestion & Food",
        stem: "Which type of wave-like muscular contraction keeps food moving forward through your intestines automatically?",
        options: ["Peristalsis", "Shivering", "Spasms", "Flexing"],
        correct: 0,
        rationale: "Peristalsis is the rhythmic, automatic squeezing of smooth muscles along your digestive tract that makes sure food moves in the right direction."
    },
    {
        system: "Digestion & Food",
        stem: "What is the primary job of the strong, enamel-coated structures called teeth in your mouth?",
        options: ["To absorb calcium minerals", "Mechanical digestion (ripping and mashing food down into small pieces)", "To taste salty flavors", "To filter out bacteria"],
        correct: 1,
        rationale: "Teeth do the initial heavy lifting of mechanical digestion! Mashing food into small pieces gives your chemical enzymes a lot more surface area to work on."
    },
    {
        system: "Digestion & Food",
        stem: "What is the hardest substance produced anywhere in the entire human body?",
        options: ["Your thighbone", "Your skull", "Tooth enamel", "Finger nails"],
        correct: 2,
        rationale: "Tooth enamel is the shiny outer shell of your teeth. It is even harder than your skeletal bones, made of durable calcium phosphate crystals!"
    },
    {
        system: "Digestion & Food",
        stem: "Which organic molecules act like microscopic scissors to speed up chemical reactions and chop food molecules into tiny pieces?",
        options: ["Hormones", "Enzymes", "Vitamins", "Minerals"],
        correct: 1,
        rationale: "Enzymes are specialized proteins that act as biological catalysts. Amylase chops starches, protease breaks down proteins, and lipase splits fats!"
    },
    {
        system: "Digestion & Food",
        stem: "Your gut is home to trillions of living microscopic organisms that keep you healthy. What are they collectively called?",
        options: ["Bad germs", "Gut Microbiota (Good bacteria)", "Viruses", "White cells"],
        correct: 1,
        rationale: "You have more friendly bacteria living in your gut than there are stars in the milky way! They help digest complex fibers, synthesize vitamins, and train your immune system."
    },
    {
        system: "Digestion & Food",
        stem: "What is the name of the muscular ring at the bottom of your stomach that opens in small bursts to let food enter the small intestine?",
        options: ["Pyloric Sphincter", "Cardiac Sphincter", "Epiglottis", "Ileocecal valve"],
        correct: 0,
        rationale: "The pyloric sphincter acts like a strict gatekeeper, releasing only a few teaspoons of acidic chyme at a time so your small intestine doesn't get overwhelmed."
    },
    {
        system: "Digestion & Food",
        stem: "Which vitamin is synthesized for you by friendly bacteria living inside your large intestine?",
        options: ["Vitamin C", "Vitamin A", "Vitamin K", "Vitamin E"],
        correct: 2,
        rationale: "Colonic bacteria produce Vitamin K, which your liver uses to build blood-clotting factors that stop you from bleeding when you get a scrape!"
    },
    {
        system: "Digestion & Food",
        stem: "What is the very first, short C-shaped section of the small intestine called where food mixes with bile and pancreatic juices?",
        options: ["Duodenum", "Jejunum", "Ileum", "Cecum"],
        correct: 0,
        rationale: "The duodenum is the primary mixing bowl of your gut. It neutralizes harsh stomach acid instantly using bicarbonate fluids from the pancreas."
    },
    {
        system: "Digestion & Food",
        stem: "What is the name of the large, flat sheet of tissue that anchors your long, winding intestines to the back of your abdomen so they don't get tangled up when you jump?",
        options: ["Peritoneum", "Mesentery", "Fascia", "Pleura"],
        correct: 1,
        rationale: "The mesentery acts like a living, fan-shaped bracket. It holds your intestines in place while serving as a secure conduit for blood vessels and nerves."
    },
    {
        system: "Digestion & Food",
        stem: "What happens if you drink cold water while standing on your head?",
        options: ["The water stays in your throat due to gravity", "The water travels upward into your stomach anyway", "The water runs out your nose", "You instantly choke"],
        correct: 1,
        rationale: "Thanks to the powerful, coordinated muscular squeezing of peristalsis in your esophagus, your digestive tract moves food and drink forward independent of gravity!"
    },
    {
        system: "Digestion & Food",
        stem: "Which of these foods is packed with complex, indigestible plant fibers that keep your large intestine healthy and moving smoothly?",
        options: ["White sugar", "Whole grains, vegetables, and fruits", "Pure butter", "Ice cream"],
        correct: 1,
        rationale: "Dietary fiber cannot be broken down by human enzymes. It adds bulk to your food track, sweeping your large intestine clean and feeding your good gut bacteria!"
    },
    /* ==========================================================================
       QUESTIONS 101 - 125: BRAIN & SENSES (High-Speed Wiring!)
       ========================================================================== */
    {
        system: "Brain & Senses",
        stem: "Which amazing organ acts like a supercomputer inside your head, controlling everything you think, feel, and do?",
        options: ["The Heart", "The Liver", "The Brain", "The Stomach"],
        correct: 2,
        rationale: "Your brain is faster and more powerful than any computer on Earth! It generates enough electrical energy while you're awake to power a small light bulb."
    },
    {
        system: "Brain & Senses",
        stem: "What is the biggest, wrinkled top part of your brain called where you do all your thinking, reading, and imagining?",
        options: ["Cerebellum", "Brainstem", "Cerebrum", "Hippocampus"],
        correct: 2,
        rationale: "The cerebrum makes up about 85% of your brain's weight. Its wrinkled surface (the cortex) is packed with billions of neurons firing off brilliant ideas!"
    },
    {
        system: "Brain & Senses",
        stem: "Tucked right at the back of your head is the 'Cerebellum' or little brain. What is its main superpower?",
        options: ["Digesting sugar", "Balance, posture, and coordination", "Pumping blood", "Smelling flowers"],
        correct: 1,
        rationale: "Without your cerebellum, you'd be clumsy and wobbling all over the place! It fine-tunes your muscle movements so you can ride a bike, dance, and stand on one foot."
    },
    {
        system: "Brain & Senses",
        stem: "What do we call the long, thick highway of nerves that travels straight down your back inside your spine?",
        options: ["Spinal Cord", "Vagus Nerve", "Optic Nerve", "Sciatic Highway"],
        correct: 0,
        rationale: "Your spinal cord acts like a high-speed fiber optic cable, zipping sensory messages up to your brain and shooting motor commands back down to your muscles."
    },
    {
        system: "Brain & Senses",
        stem: "What are the billions of microscopic, specialized nerve cells that make up your brain and nervous system called?",
        options: ["Nephrons", "Neurons", "Alveoli", "Platelets"],
        correct: 1,
        rationale: "Neurons communicate with each other across tiny gaps called synapses using electrical flashes and chemical messengers called neurotransmitters."
    },
    {
        system: "Brain & Senses",
        stem: "Which special nerve acts like an internet cable connecting your eyeballs directly to the back of your brain?",
        options: ["Auditory Nerve", "Olfactory Nerve", "Optic Nerve", "Facial Nerve"],
        correct: 2,
        rationale: "Your eyes actually capture pictures upside down! The optic nerve sends these inverted images to your brain's visual cortex, which automatically flips them right-side up for you."
    },
    {
        system: "Brain & Senses",
        stem: "Inside your eye is a colorful ring (blue, green, brown, or hazel). What is this beautiful structure called?",
        options: ["Pupil", "Cornea", "Iris", "Retina"],
        correct: 2,
        rationale: "The iris is a clever muscular ring. It stretches and shrinks to change the size of your pupil, controlling exactly how much light enters your eye!"
    },
    {
        system: "Brain & Senses",
        stem: "What is the dark black hole right in the center of your eye that lets light bounce in?",
        options: ["Iris", "Pupil", "Lens", "Sclera"],
        correct: 1,
        rationale: "The pupil isn't actually a black thing—it's an open window! It looks dark because the inside of your eyeball is dark, absorbing the incoming light."
    },
    {
        system: "Brain & Senses",
        stem: "The back wall of your eyeball is covered in millions of light-detecting cells called 'Rods and Cones'. What special job do the CONES do?",
        options: ["They let you see bright, vibrant colors", "They let you see in pitch black darkness", "They produce watery tears", "They keep your eyeball round"],
        correct: 0,
        rationale: "Remember this easy trick: **C**ones are for **C**olor! Meanwhile, your rod cells work best in dim light to help you see black, white, and gray shadows."
    },
    {
        system: "Brain & Senses",
        stem: "Which sensory organ houses the absolute smallest bones in your body and helps you keep your balance?",
        options: ["Your Nose", "Your Outer Ear", "Your Inner Ear", "Your Tongue"],
        correct: 2,
        rationale: "Deep inside your ear are tiny fluid-filled loops called semicircular canals. When you slosh this liquid around by spinning in circles, you feel dizzy!"
    },
    {
        system: "Brain & Senses",
        stem: "What is the fun snail-shaped structure deep inside your ear that turns sound vibrations into electrical brain signals?",
        options: ["Eardrum", "Cochlea", "Pinna", "Stapes"],
        correct: 1,
        rationale: "Cochlea means 'snail shell' in ancient Greek! It is filled with watery liquid and lined with thousands of microscopic sensory hairs that dance to the beat of music."
    },
    {
        system: "Brain & Senses",
        stem: "Your sense of smell and your sense of taste are best friends! Which organ catches floating scent particles when you sniff delicious cookies?",
        options: ["Your Nose (Olfactory system)", "Your Tongue", "Your Throat", "Your Ears"],
        correct: 0,
        rationale: "Your olfactory receptors in your nose work together with your tastebuds. That's why food tastes bland and boring when you have a stuffy nose from a cold!"
    },
    {
        system: "Brain & Senses",
        stem: "What is the name of the built-in reflex where your leg automatically kicks forward when a doctor gently taps your knee?",
        options: ["Patellar Reflex", "Elbow Shock", "Startle Reflex", "Jump Reflex"],
        correct: 0,
        rationale: "Reflexes are emergency shortcuts! The tap signal travels to your spinal cord, which instantly shoots a 'KICK!' command straight back to your leg without waiting for your brain to think about it."
    },
    {
        system: "Brain & Senses",
        stem: "Which part of your brainstem acts like an automatic control center for your heartbeat, breathing, and blood pressure?",
        options: ["Cerebrum", "Medulla Oblongata", "Frontal Lobe", "Amygdala"],
        correct: 1,
        rationale: "The medulla oblongata connects your brain to your spinal cord. It runs your vital life-support systems on autopilot so you stay alive while sleeping!"
    },
    {
        system: "Brain & Senses",
        stem: "Which tiny, almond-shaped cluster deep inside your brain is famous for controlling big emotions like fear, excitement, and happiness?",
        options: ["Hippocampus", "Amygdala", "Thalamus", "Pituitary"],
        correct: 1,
        rationale: "Your amygdala is your brain's emotional alarm system! When it senses danger, it triggers your 'fight or flight' response, flooding your body with instant energy."
    },
    {
        system: "Brain & Senses",
        stem: "Which seahorse-shaped brain structure is your master memory archiver, turning today's fun experiences into long-term memories?",
        options: ["Amygdala", "Hippocampus", "Cerebellum", "Brainstem"],
        correct: 1,
        rationale: "The word hippocampus literally translates to 'seahorse'! While you sleep peacefully at night, this structure files away everything new you learned during the day."
    },
    {
        system: "Brain & Senses",
        stem: "What is the tough, clear front window of your eye called that shields your pupil and helps focus light?",
        options: ["Cornea", "Retina", "Sclera", "Optic Disc"],
        correct: 0,
        rationale: "Your cornea is completely transparent and has no blood vessels inside it at all! It receives its oxygen directly from the outside air."
    },
    {
        system: "Brain & Senses",
        stem: "What do we call the tough, white outer protective shell that covers the rest of your eyeball?",
        options: ["Sclera", "Cornea", "Iris", "Macula"],
        correct: 0,
        rationale: "The sclera is the thick 'white of your eye'. It acts like a sturdy canvas wall, providing firm attachment points for the tiny muscles that move your eyes around."
    },
    {
        system: "Brain & Senses",
        stem: "When you touch an ice cube or a hot stove, which microscopic skin sensors alert your brain to the temperature change?",
        options: ["Thermoreceptors", "Photoreceptors", "Chemoreceptors", "Hair follicles"],
        correct: 0,
        rationale: "Thermo means heat! Your skin is packed with specialized nerve endings that constantly report hot, cold, touch, pressure, and pain sensations back to headquarters."
    },
    {
        system: "Brain & Senses",
        stem: "Which lobe at the very FRONT of your brain is responsible for problem-solving, planning, and your unique personality?",
        options: ["Occipital Lobe", "Temporal Lobe", "Frontal Lobe", "Parietal Lobe"],
        correct: 2,
        rationale: "Your frontal lobe is the executive boss of your brain! It takes the longest to fully mature, continuing to develop and build new wiring until you are about 25 years old."
    },
    {
        system: "Brain & Senses",
        stem: "Which lobe at the very BACK of your head is dedicated entirely to processing what your eyes see?",
        options: ["Frontal Lobe", "Occipital Lobe", "Temporal Lobe", "Parietal Lobe"],
        correct: 1,
        rationale: "Even though your eyes are on the front of your face, the wiring runs straight to the occipital lobe at the back! That's why bumping the back of your head can make you 'see stars'."
    },
    {
        system: "Brain & Senses",
        stem: "What clear, watery cushioning fluid surrounds your brain and spinal cord to protect them from bumps?",
        options: ["Cerebrospinal Fluid (CSF)", "Plasma", "Lymph", "Pure water"],
        correct: 0,
        rationale: "Your brain literally floats inside your skull! CSF acts like a built-in shock absorber while circulating nutrients and washing away cellular waste."
    },
    {
        system: "Brain & Senses",
        stem: "What do we call the tiny, bumpy structures sitting all over your tongue that catch flavors like sweet, salty, sour, and bitter?",
        options: ["Taste Buds (Papillae)", "Saliva glands", "Enamel tags", "Cilia hairs"],
        correct: 0,
        rationale: "You have around 10,000 taste buds! They regenerate and replace themselves every 1 to 2 weeks, ensuring your sense of taste stays sharp."
    },
    {
        system: "Brain & Senses",
        stem: "Which side of your body does the LEFT hemisphere of your brain primarily control?",
        options: ["The left side", "The right side", "Both sides equally", "Neither side"],
        correct: 1,
        rationale: "Brain wiring is crossed! The left side of your brain manages movement and touch for the right side of your body, while the right brain controls your left side."
    },
    {
        system: "Brain & Senses",
        stem: "About how fast can nerve impulses zip along your body's fastest myelinated nerve superhighways?",
        options: ["About 5 miles per hour", "About 50 miles per hour", "Up to 270 miles per hour", "At the speed of light"],
        correct: 2,
        rationale: "High-speed sensory and motor nerves are wrapped in a fatty insulation called myelin. This coating lets electrical messages leap down the wire at race car speeds!"
    },
    /* ==========================================================================
       QUESTIONS 126 - 150: SKIN, HORMONES & FUN BODY FACTS!
       ========================================================================== */
    {
        system: "Skin & Hormones",
        stem: "Which organ is actually the LARGEST and heaviest organ in your entire body, covering you from head to toe?",
        options: ["Your Liver", "Your Large Intestine", "Your Skin", "Your Brain"],
        correct: 2,
        rationale: "Your skin is a massive living waterproof blanket! It accounts for about 15% of your body weight and protects all your squishy inside parts from germs and sunshine."
    },
    {
        system: "Skin & Hormones",
        stem: "What is the name of the dark natural pigment in your skin that helps protect you from getting sunburned?",
        options: ["Melanin", "Keratin", "Collagen", "Chlorophyll"],
        correct: 0,
        rationale: "Melanin acts like built-in microscopic sunscreen! When you spend time in the bright sun, your skin creates extra melanin to shield your cells, which gives you a tan."
    },
    {
        system: "Skin & Hormones",
        stem: "What tough, waterproof protein makes up your outer skin layer, your hair, and your fingernails?",
        options: ["Keratin", "Enamel", "Myosin", "Hemoglobin"],
        correct: 0,
        rationale: "Keratin is super tough and durable! It's the exact same animal protein that grows into horse hooves, bird feathers, and rhino horns in the wild."
    },
    {
        system: "Skin & Hormones",
        stem: "When you get super hot from running around outside, what does your skin produce to cool you down?",
        options: ["Goosebumps", "Sweat", "Extra hair", "Oil"],
        correct: 1,
        rationale: "Sweating is an amazing built-in air conditioner! As warm sweat evaporates off your skin into the air, it pulls body heat away with it so you don't overheat."
    },
    {
        system: "Skin & Hormones",
        stem: "Why do you get funny bumpy 'goosebumps' on your arms when you step into a chilly room?",
        options: ["Your skin is shrinking", "Tiny microscopic muscles pull your arm hairs straight up to trap warm air", "Your blood turns cold", "Your sweat freezes"],
        correct: 1,
        rationale: "Long ago when our evolutionary ancestors had thick fur coats, fluffing up the hair trapped a cozy layer of warm air right next to the skin to beat the cold!"
    },
    {
        system: "Skin & Hormones",
        stem: "Look at the tips of your fingers. What special oily patterns grow there that are 100% unique to only YOU?",
        options: ["Knuckle rings", "Fingerprints", "Nail ridges", "Palm lines"],
        correct: 1,
        rationale: "No two people on Earth—not even identical twins—have the exact same fingerprints! These swirly ridges also give your fingers rough friction so you can grip smooth toys easily."
    },
    {
        system: "Skin & Hormones",
        stem: "Which gland in your brain is nicknamed the 'Master Gland' because it shoots out growth hormones to make you grow taller?",
        options: ["Thyroid Gland", "Pituitary Gland", "Adrenal Gland", "Sweat Gland"],
        correct: 1,
        rationale: "Your pituitary gland is only the size of a tiny green pea, dangling right beneath your brain! It acts like a team captain, shouting chemical orders to all your other hormone factories."
    },
    {
        system: "Skin & Hormones",
        stem: "When you get scared by a spooky movie or super excited to ride a rollercoaster, which hormone rushes through your blood to give you instant energy?",
        options: ["Melatonin", "Adrenaline (Epinephrine)", "Insulin", "Calcium"],
        correct: 1,
        rationale: "Adrenaline is your body's rocket fuel! Your adrenal glands sit right on top of your kidneys like little party hats, firing off adrenaline to make your heart race and your muscles ready to jump."
    },
    {
        system: "Skin & Hormones",
        stem: "Which butterfly-shaped gland sits right at the front of your neck and manages your body's energy speed (metabolism)?",
        options: ["Thyroid Gland", "Pituitary Gland", "Pancreas", "Thymus"],
        correct: 0,
        rationale: "Your thyroid gland acts like the gas pedal in a car! It releases hormones that tell your cells exactly how fast to burn food fuel for everyday energy."
    },
    {
        system: "Skin & Hormones",
        stem: "Which hormone is produced by your brain when the sun goes down to make you feel sleepy and ready for bed?",
        options: ["Adrenaline", "Melatonin", "Insulin", "Oxytocin"],
        correct: 1,
        rationale: "Your pineal gland acts like an internal sleep clock. When your eyes notice it's getting dark outside, it pumps out sleepy melatonin. When bright morning sunlight hits your room, it stops!"
    },
    {
        system: "Fun Body Facts",
        stem: "Your fingernails and toenails grow non-stop! Which nail grows the absolute FASTEST?",
        options: ["Your pinky fingernail", "Your big toenail", "Your middle fingernail", "Your thumb toenail"],
        correct: 2,
        rationale: "Fingernails grow about three times faster than toenails! And fun fact: the nail on your longest finger (the middle finger) always outgrows the rest."
    },
    {
        system: "Fun Body Facts",
        stem: "About how many hairs are growing on top of an average human head?",
        options: ["About 1,000 hairs", "About 10,000 hairs", "About 100,000 hairs", "Over 1 million hairs"],
        correct: 2,
        rationale: "You have around 100,000 hair follicles on your scalp! It's completely normal to shed roughly 50 to 100 tired hairs every day to make room for fresh new ones."
    },
    {
        system: "Fun Body Facts",
        stem: "If you unspooled all the microscopic DNA threads hidden inside the cells of just ONE human body and laid them end-to-end, how far would they stretch?",
        options: ["Across a football field", "All the way across your country", "From the Earth to the Sun and back over 300 times!", "Around the Earth once"],
        correct: 2,
        rationale: "Your DNA is packed unimaginably tight inside your cell nuclei! You contain billions of miles of genetic instruction code written just for you."
    },
    {
        system: "Fun Body Facts",
        stem: "What is the only organ in the human body that can naturally regenerate and regrow itself even if half of it is removed?",
        options: ["The Heart", "The Liver", "The Brain", "The Left Lung"],
        correct: 1,
        rationale: "Your liver is an evolutionary marvel! Because it cleans harmful toxins out of your blood, it evolved the superhero ability to heal and rebuild its own missing tissue."
    },
    {
        system: "Fun Body Facts",
        stem: "Why do your fingers and toes get funny and wrinkly like prunes after soaking in a warm bubble bath for a long time?",
        options: ["Your skin is soaking up too much bath water", "Your nervous system deliberately shrinks blood vessels to give you better wet gripping tires!", "Your outer skin layer is washing away", "The soap eats your keratin"],
        correct: 1,
        rationale: "Prune fingers are actually an amazing evolutionary survival tool! Your brain fires nerve signals to wrinkle your fingertips so you can grip slippery, wet rocks safely in the water."
    },
    {
        system: "Fun Body Facts",
        stem: "When you accidentally let out a loud, funny burp after drinking fizzy soda, where is that air escaping from?",
        options: ["Your lungs", "Your stomach", "Your small intestine", "Your sinuses"],
        correct: 1,
        rationale: "Fizzy sodas are packed with tiny carbon dioxide bubbles. When you gulp them down, the gas collects in your stomach until your food pipe opens the top door to let out a loud 'BURP!'."
    },
    {
        system: "Fun Body Facts",
        stem: "What do your hardworking kidneys produce to flush filtered waste and extra salt out of your bloodstream?",
        options: ["Urine (Pee)", "Bile", "Sweat", "Saliva"],
        correct: 0,
        rationale: "Your two bean-shaped kidneys filter your entire blood supply roughly 40 times a day! They scrub out waste molecules and mix them with water to create yellow urine."
    },
    {
        system: "Fun Body Facts",
        stem: "Where does your body securely store your liquid urine until you finally find a bathroom?",
        options: ["In the Gallbladder", "In the Urinary Bladder", "In the Appendix", "In the Spleen"],
        correct: 1,
        rationale: "Your bladder is a stretchy, waterproof muscular balloon sitting in your pelvis. When it fills up with about two cups of liquid, it signals your brain that it's time to go!"
    },
    {
        system: "Fun Body Facts",
        stem: "What causes the loud, rumbly 'growling' sound your stomach makes when you are super hungry?",
        options: ["Your stomach bones are grinding", "Air and digestive juices sloshing through empty squishy intestines", "Your heart beating against your belly", "Hungry gut bacteria shouting"],
        correct: 1,
        rationale: "The medical word for tummy rumbling is 'Borborygmi'! When your stomach and intestines are empty, automatic peristalsis muscle waves squeeze empty air pockets, creating loud echoes."
    },
    {
        system: "Fun Body Facts",
        stem: "Humans are actually bioluminescent (we glow in the dark!). Why can't we see our own magical human body glow with our eyes?",
        options: ["We only glow when we are fast asleep", "The light we emit is 1,000 times weaker than our eyes can detect", "Our clothes block 100% of the light", "Only teenagers glow"],
        correct: 1,
        rationale: "As your cells burn energy and metabolize food, they give off tiny amounts of visible light! The glow is brightest around your forehead and cheeks in the late afternoon."
    },
    {
        system: "Fun Body Facts",
        stem: "Which of these awesome superpowers does your squishy purple Spleen perform on the left side of your tummy?",
        options: ["It recycles old red blood cells and stores emergency backup blood", "It digests candy bars", "It helps you balance on a beam", "It makes your voice sound higher"],
        correct: 0,
        rationale: "Your spleen acts like a blood security inspection station! It filters out old, worn-out red blood cells and keeps a reserve pool of fresh immune cells ready for action."
    },
    {
        system: "Fun Body Facts",
        stem: "Why do you blink your eyes about 15 to 20 times every single minute without ever thinking about it?",
        options: ["To rest your eye muscles", "To spread salty, cleaning tears across your eyeball window like windshield wipers", "To push light into your pupil", "To exercise your eyelids"],
        correct: 1,
        rationale: "Every quick blink coats your cornea with a fresh, microscopic layer of antibacterial tears, washing away floating dust specks and keeping your vision crystal clear!"
    },
    {
        system: "Fun Body Facts",
        stem: "How much saliva (spit) does an average human produce over an entire lifetime?",
        options: ["Enough to fill a soda can", "Enough to fill a bathtub", "Enough to fill two entire swimming pools!", "Enough to fill a water bottle"],
        correct: 2,
        rationale: "Your salivary glands are busy little water fountains! Over your life, you generate roughly 10,000 gallons of spit to help you taste, chew, and swallow delicious meals."
    },
    {
        system: "Fun Body Facts",
        stem: "What happens to your height when you go to sleep peacefully horizontally in your bed all night?",
        options: ["You shrink half an inch", "You wake up about half an inch TALLER in the morning!", "Your height stays exactly the same to the millimeter", "Your legs get shorter"],
        correct: 1,
        rationale: "During the day, gravity pulls down on your spine, squishing the watery cartilage discs between your backbones. While you sleep horizontally, those spongy discs soak up water and expand, making you taller!"
    },
    {
        system: "Fun Body Facts",
        stem: "You are truly one-of-a-kind! Besides your unique fingerprints, what OTHER body part has a print pattern that belongs strictly to you?",
        options: ["Your elbow print", "Your tongue print", "Your kneecap print", "Your earlobe print"],
        correct: 1,
        rationale: "Just like your fingertips, your muscular tongue is covered in unique geometric bumps and ridges. No one else on the planet shares your exact tongue print!"
    }
]; // <--- THE MASTER ARRAY CLOSE

/* ==========================================================================
   3. APP LAUNCHER & DOM BINDINGS
   ========================================================================== */
DOM.controls.initBtn.addEventListener('click', initializeAssessment);
DOM.controls.submitBtn.addEventListener('click', submitAnswer);
DOM.controls.nextBtn.addEventListener('click', advanceItem);
DOM.controls.finalizeBtn.addEventListener('click', concludeExamination);
DOM.controls.restartBtn.addEventListener('click', () => switchView(DOM.views.welcome));

// FLOATING BACK BUTTON BINDING:
// Currently bound to return to the welcome dashboard during sandbox testing.
// Downstream platform integration: update line below to window.location.href = '../index.html'
DOM.controls.globalBack.addEventListener('click', () => {
    stopTimer();
    switchView(DOM.views.welcome);
});

window.addEventListener('beforeunload', () => clearInterval(AppState.timer));
