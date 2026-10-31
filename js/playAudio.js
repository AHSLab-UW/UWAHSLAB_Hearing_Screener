let audioCtxt = new AudioContext();


let gain = audioCtxt.createGain();;
let panner = audioCtxt.createStereoPanner();  ;
gain.connect(panner);
panner.connect(audioCtxt.destination);

let nodes;
let testConfig;
let currentTest;
let testGainOffsetDB = 0;
let testTransducer = DEFAULT_TRANSDUCER;
const TONE_PULSE_COUNT = 3;
const TONE_PULSE_DURATION_SECONDS = 0.2;
const TONE_PULSE_GAP_SECONDS = 0.2;
const TONE_PULSE_RAMP_SECONDS = 0.035;

const state = {
    testMode: sessionStorage.getItem("testmode"), // single: each ear; right: right ear only
    freqIndex:0,
    frequencies: [1000, 2000, 4000, 500],
    currentEar: sessionStorage.getItem("testmode") === "right" ? "right" : "left",
    currentDBHL: 50,
    increment:10,
    prevResponse: true,
    isFirstAttempt: true,
    results: { left: [], right: [] },
    responses: {left: [], right: [] }
}

const numbers = document.querySelector(".numbers");
const enable = document.querySelector("#enableMessage");
const testModeNotice = document.querySelector("#testModeNotice");
if (testModeNotice) testModeNotice.textContent = state.testMode === "right"
    ? "For efficiency, only your right ear will be tested, and your left-ear thresholds will be inferred."
    : "Each ear will be tested separately.";
enable.addEventListener("click", async ()=>{
    if (!isEligibleAdultAge(Number(sessionStorage.getItem("userAge")))) {
        sessionStorage.removeItem("userAge");
        alert("This hearing screening tool is for adults aged 18 or older. Please enter an eligible age before starting.");
        window.location.href = "../pages/SurveyPage.html";
        return;
    }
    if (!["single", "right"].includes(state.testMode)) {
        alert("Please select whether you notice a difference between your ears before starting.");
        window.location.href = "../pages/Startpage.html";
        return;
    }
    const calibration = window.levelCalibration ? window.levelCalibration.beginTest() : storedLevelCalibration();
    testGainOffsetDB = calibration ? calibration.gainOffsetDB : 0;
    testTransducer = window.levelCalibration ? window.levelCalibration.transducer() : selectedTransducer();
    sessionStorage.setItem("transducerUsed", testTransducer);
    sessionStorage.setItem(LEVEL_CALIBRATION_USED_KEY, JSON.stringify(calibration || { method: "none" }));
    await audioCtxt.resume();
    const now = new Date();
    sessionStorage.setItem("startTime",now.toLocaleString());
    window.ambientNoiseMonitor?.beginTest();
    enableYesOrNo();
    enable.disabled = true;
    setTimeout(() => {
        yesOrNo.forEach(button => {
            button.style.visibility = "visible";
        });
        enable.style.display = "none";
        numbers.style.visibiliyt = "visibile";
    }, 100);
    setTimeout(() => {
        playTestTone(state.frequencies[state.freqIndex],state.currentDBHL, getPanValue(),true);
    },600);
    disableYesOrNo();
});


// yes or no buttons
const yesOrNo = document.querySelectorAll(".test-button");

yesOrNo.forEach(button => {
    button.addEventListener("click", promptUser);
});

disableYesOrNo();

function disableYesOrNo () {
    yesOrNo.forEach(button => {
        button.disabled = true;
    })
}

function enableYesOrNo () {
    yesOrNo.forEach(button => {
        button.disabled = false;
    });
}

function playTestTone(frequency, dbHL, whichEar, needVisual) {
    audioCtxt.resume(); 
    let oscillator = audioCtxt.createOscillator();;
    oscillator.frequency.value = frequency;
    // Transducer-specific RETSPLs (TRANSDUCERS in perceptualCalibration.js).
    let dbSPL = dbHL + retsplFor(frequency, testTransducer);
    console.log(state.freqIndex);
    // Levels are relative to the optional level calibration (perceptualCalibration.js).
    let volume = splToAmplitude(dbSPL, testGainOffsetDB);

    oscillator.connect(gain);
    const startTime = audioCtxt.currentTime + 3;
    const endTime = startTime + TONE_PULSE_COUNT * TONE_PULSE_DURATION_SECONDS +
        (TONE_PULSE_COUNT - 1) * TONE_PULSE_GAP_SECONDS;

    for (let pulse = 0; pulse < TONE_PULSE_COUNT; pulse++) {
        const pulseStart = startTime + pulse * (TONE_PULSE_DURATION_SECONDS + TONE_PULSE_GAP_SECONDS);
        const pulseEnd = pulseStart + TONE_PULSE_DURATION_SECONDS;
        gain.gain.setValueAtTime(0, pulseStart);
        gain.gain.linearRampToValueAtTime(volume, pulseStart + TONE_PULSE_RAMP_SECONDS);
        gain.gain.setValueAtTime(volume, pulseEnd - TONE_PULSE_RAMP_SECONDS);
        gain.gain.linearRampToValueAtTime(0, pulseEnd);
    }
    panner.pan.setValueAtTime(whichEar, startTime);

    oscillator.start(startTime);
    oscillator.stop(endTime);

    const msUntilStart = (startTime - audioCtxt.currentTime)*1000;
    const msUntilStop = (endTime - audioCtxt.currentTime)*1000;
    if(needVisual){
        visualEffect();
        setTimeout(() => {
            soundSignal.style.visibility = "visible";
            enableYesOrNo();
        }, msUntilStart);

        setTimeout(() => {
            soundSignal.style.visibility = "hidden";
            enableYesOrNo();
        }, msUntilStop);
    }
    
    
    setTimeout(enableYesOrNo, msUntilStop);
}

function promptUser(event) {
    const userSaidYes = (event.currentTarget.id === "yes");
    disableYesOrNo();
    let earName = state.currentEar;
    console.log(state.currentDBHL);
    const resultEntry = {
        ear: earName,
        frequency: state.frequencies[state.freqIndex],
        levelHL: state.currentDBHL, 
        response: userSaidYes ? "yes" : "no"
    };
    if(state.isFirstAttempt){
        state.prevResponse = true;
    }
    if(state.currentEar == "left"){
        state.responses.left.push(resultEntry);
    }else {
        state.responses.right.push(resultEntry);
    }

    // changed the logic. Basically it can oscillate as many times. but it advances to the 
    // next audio the moment after a no is preceded by a yes.

    if (userSaidYes && !state.prevResponse) {
        saveThresholdAndAdvance();
    } else {
        if(userSaidYes){
            state.increment = -10;
        } else {
            state.increment = 10;
        }
        state.isFirstAttempt = false;
        
        state.currentDBHL += state.increment;
        playTestTone(state.frequencies[state.freqIndex], state.currentDBHL, getPanValue(),true);
        state.prevResponse = userSaidYes;
    }
    console.log(state.results);
}

function saveThresholdAndAdvance () {
    let storeWhich;
    storeWhich = state.currentEar;
    state.results[storeWhich].push(state.currentDBHL);
    
    state.freqIndex++;

    state.currentDBHL = 50;
    state.isFirstAttempt = true;

    if (state.freqIndex < state.frequencies.length) {
        playTestTone(state.frequencies[state.freqIndex], state.currentDBHL, getPanValue(),true);
    } 
    else if (state.currentEar === "left" && state.testMode === "single") {
        state.currentEar = "right";
        state.freqIndex = 0;
        console.log("Switching to Right Ear");
        playTestTone(state.frequencies[state.freqIndex], state.currentDBHL, getPanValue(),true);
    } 
    else {
        finishTest();
    }
}


function finishTest() {
    window.ambientNoiseMonitor?.endTest();
    for (const ear of ["left", "right"]) {
        const results = state.results[ear];
        sessionStorage.setItem(`${ear}Results`, JSON.stringify(results));
        sessionStorage.setItem(`${ear}Responses`, JSON.stringify(state.responses[ear]));
        if (results.length) {
            const threshold = results.reduce((sum, level) => sum + level, 0) / results.length;
            sessionStorage.setItem(`${ear}Threshold`, String(Math.round(threshold * 100) / 100));
        } else {
            sessionStorage.removeItem(`${ear}Threshold`);
        }
    }
    window.location.href = "../pages/resultsPage.html";
}


function getPanValue() {
    if (state.currentEar === "left") return -1;
    return 1;
}

function visualEffect(){
    numbers.style.visibility = "visible";
    numbers.textContent = "Ready: 3";
    setTimeout( () => {
            numbers.textContent = "Ready: 2";
    },1000);
    setTimeout( () => {
            numbers.textContent = "Ready: 1";
    },2000);
    setTimeout( () => {
            numbers.style.visibility = "hidden";
    },3000);
}
