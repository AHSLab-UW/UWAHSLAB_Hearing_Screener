let audioCtxt = new AudioContext();

const referenceDB = 93.5;// requirements that the volume of the device is set to the max.
const referenceAMP = 0.1;
const dbHLMeans = [7,5.2,12.4,12]; 

let gain = audioCtxt.createGain();;
let panner = audioCtxt.createStereoPanner();  ;
gain.connect(panner);
panner.connect(audioCtxt.destination);

let nodes;
let testConfig;
let currentTest;

const state = {
    testMode: sessionStorage.getItem("testmode"), //single or both
    freqIndex:0,
    frequencies: [1000, 2000, 4000, 500],
    currentEar: "left", //-1 for left, 1 for right, 0 for both
    currentDBHL: 50,
    increment:10,
    prevResponse: true,
    isFirstAttempt: true,
    results: { left: [], right: [], both: [] },
    responses: {left: [], right: [], both: [] }
}

const numbers = document.querySelector(".numbers");
const enable = document.querySelector("#enableMessage");
enable.addEventListener("click", async ()=>{
    await audioCtxt.resume();
    const now = new Date();
    sessionStorage.setItem("startTime",now.toLocaleString());
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
    let dbSPL = dbHL + dbHLMeans[state.freqIndex];
    console.log(state.freqIndex);
    let volume = referenceAMP * calibrate(dbSPL);

    gain.gain.setValueAtTime(volume, audioCtxt.currentTime,0.01);
    panner.pan.setValueAtTime(whichEar, audioCtxt.currentTime, 0.01);

    oscillator.connect(gain);
    const startTime = audioCtxt.currentTime + 3;
    const endTime = startTime+1;

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
    let earName = state.testMode === "both" ? "both" : state.currentEar;
    console.log(state.currentDBHL);
    const resultEntry = {
        ear: earName,               // saves "left", "right", or "both"
        frequency: state.frequencies[state.freqIndex],
        levelHL: state.currentDBHL, 
        response: userSaidYes ? "yes" : "no"
    };
    if(state.isFirstAttempt){
        state.prevResponse = true;
    }
    if(state.testMode=="both"){
        state.responses.both.push(resultEntry);
    }else if(state.currentEar == "left"){
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
    if(state.testMode == "both"){
        storeWhich = "both";
    } else {
        storeWhich = state.currentEar;
    }
    state.results[storeWhich].push(state.currentDBHL);
    
    state.freqIndex++;

    state.currentDBHL = 50;
    state.isFirstAttempt = true;

    if (state.freqIndex < state.frequencies.length) {
        playTestTone(state.frequencies[state.freqIndex], state.currentDBHL, getPanValue(),true);
    } 
    else if (state.currentEar === "left" && state.testMode != "both") {
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
    if(state.testMode == "both"){
        let sum = 0;
        for(let i = 0 ; i < state.frequencies.length; i ++){
            sum+= state.results["both"][i];
        }
        const bothThreshold = Math.round((sum/4)*100)/100;
        const bothResults = JSON.stringify(state.results["both"]);
        const bothResponses = JSON.stringify(state.responses["both"]);
        sessionStorage.setItem("bothResults", bothResults);
        sessionStorage.setItem("bothThreshold", bothThreshold);
        sessionStorage.setItem("bothResponses", bothResponses);
    }else {
        let leftSum = 0;
        for(let i = 0 ; i < state.frequencies.length; i ++){
            leftSum+= state.results["left"][i];
        }
        const leftThreshold = Math.round((leftSum/4)*100)/100;
        const leftResults = JSON.stringify(state.results["left"]);
        const leftResponses = JSON.stringify(state.responses["left"]);
        sessionStorage.setItem("leftResults", leftResults);
        sessionStorage.setItem("leftThreshold", leftThreshold);
        sessionStorage.setItem("leftResponses", leftResponses)

        let rightSum = 0;
        for(let i = 0 ; i < state.frequencies.length; i ++){
            rightSum+= state.results["right"][i];
        }
        const rightThreshold = Math.round((rightSum/state.frequencies.length)*100)/100;
        const rightResults = JSON.stringify(state.results["right"]);
        const rightResponses = JSON.stringify(state.responses["right"]);
        sessionStorage.setItem("rightResults",  rightResults);
        sessionStorage.setItem("rightThreshold", rightThreshold);
        sessionStorage.setItem("rightResponses", rightResponses)
    }
    window.location.href = "../pages/resultsPage.html";
}


function calibrate (audioLevel){
    let gain = Math.pow(10, (audioLevel-referenceDB)/20);
    return gain; 
}

function getPanValue() {
    if (state.testMode == "both") return 0;
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
