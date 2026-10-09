document.addEventListener("DOMContentLoaded", loadContent);
let testmode = sessionStorage.getItem("testmode");
function loadContent() {
    
    if (testmode == "both"){
        let stringRound = sessionStorage.getItem("bothResults");
        document.querySelectorAll(".single").forEach(element => element.style.display = "none");
        const round = JSON.parse(stringRound);
        let last = round.pop();
        round.unshift(last);

        for (let i = 0; i < round.length; i++) {
            document.getElementById("val" + i).textContent = round[i] + " dB";
        }
        const hearingThreshold = document.getElementById("bothThreshold");
        let hearingNumber = sessionStorage.getItem("bothThreshold");
        //hearingThreshold.textContent = hearingNumber; // + " dBHL"
        //displaying the pca number.
        //add in age and sex.
        const pcaResult = runPCA();
        const recon = pcaResult.reconstructed[0];
        const pcaRight = [recon[2], recon[3], recon[4], recon[5]];
        const pcaHearingNum = Math.round((pcaRight.reduce((a,b) => a+b,0) / 4));
        hearingThreshold.textContent = pcaHearingNum;
        sessionStorage.setItem("pcaHearingNumber", pcaHearingNum);
    } else {
        document.querySelectorAll(".both").forEach(element => element.style.display = "none");
        let stringLeft = sessionStorage.getItem("leftResults");
        let stringRight = sessionStorage.getItem("rightResults");
        const leftRound = JSON.parse(stringLeft);
        let leftLast = leftRound.pop();
        leftRound.unshift(leftLast);

        for (let i = 0; i < leftRound.length; i++) {
            document.getElementById("valL" + i).textContent = leftRound[i] + " dB";
        }
        const leftThreshold = document.getElementById("leftThreshold");
        let leftNumber = sessionStorage.getItem("leftThreshold");
        //leftThreshold.textContent = "Left Ear: " + leftNumber;
        const rightRound = JSON.parse(stringRight);
        let rightLast = rightRound.pop();
        rightRound.unshift(rightLast);

        for (let i = 0; i < rightRound.length; i++) {
            document.getElementById("valR" + i).textContent = rightRound[i] + " dB";
        }

        const rightThreshold = document.getElementById("rightThreshold");
        let rightNumber = sessionStorage.getItem("rightThreshold");
        //rightThreshold.textContent =  "Right Ear: " + rightNumber;
        const pcaResult = runPCA();
        const recon = pcaResult.reconstructed[0];
        const pcaLeft  = [recon[6], recon[7], recon[8], recon[9]];
        const pcaRight = [recon[2], recon[3], recon[4], recon[5]];
        const pcaLeftNum  = Math.round((pcaLeft.reduce((a,b) => a+b,0) / 4)); //rounded
        const pcaRightNum = Math.round((pcaRight.reduce((a,b) => a+b,0) / 4)); //rounded
        leftThreshold.textContent  = "Left Ear: "  + pcaLeftNum;
        rightThreshold.textContent = "Right Ear: " + pcaRightNum;
        sessionStorage.setItem("pcaLeftNum", pcaLeftNum);
        sessionStorage.setItem("pcaRightNum", pcaRightNum);
    }
}

function generateCSV() {
    // 1. Get current date and time
    const now = new Date();
    const timestamp = now.toLocaleTimeString(); 
    const startTime = sessionStorage.getItem("startTime");
    // 2. Retrieve the data from storage correctly
    const age = sessionStorage.getItem("userAge") || "Not Provided";
    const sex = sessionStorage.getItem("userSex") || "Not Provided";
    const difficulty = sessionStorage.getItem("likertResponse") || "Not Provided";
    const device = sessionStorage.getItem("hearingDevice") || "Not Provided";
    const confidence = sessionStorage.getItem("confidenceLevel") || "Not Provided";
    // Define the labels to match the order in playAudio.js: [1000, 2000, 4000, 500]
    const freqLabels = [1000, 2000, 4000, 500];

    // 3. Build the CSV content header
    let csvContent = `Test Date and Start Time: ,${startTime}\n`;
    csvContent += `Test End Time:,${timestamp}\n`;
    csvContent += `Age,${age}\n`;
    csvContent += `Sex,${sex}\n`;
    csvContent += `Subjective Difficulty,${difficulty}\n`;
    csvContent += `Device Usage Likelihood,${device}\n`;
    csvContent += `Confidence Level},${confidence}\n\n`;

    if (testmode === "both") {
        const rawHearingNum = sessionStorage.getItem("bothThreshold") || "Not Provided";
        const pcaHearingNum = sessionStorage.getItem("pcaHearingNumber") || "Not Provided";
        csvContent += `Raw Hearing Number,${rawHearingNum}\n`;
        csvContent += `PCA Hearing Number,${pcaHearingNum}\n\n`;
    } else {
        const rawLeftNum  = sessionStorage.getItem("leftThreshold")  || "Not Provided";
        const rawRightNum = sessionStorage.getItem("rightThreshold") || "Not Provided";
        const pcaLeftNum  = sessionStorage.getItem("pcaLeftNum")     || "Not Provided";
        const pcaRightNum = sessionStorage.getItem("pcaRightNum")    || "Not Provided";
        csvContent += `Raw Left Hearing Number,${rawLeftNum}\n`;
        csvContent += `Raw Right Hearing Number,${rawRightNum}\n`;
        csvContent += `PCA Left Hearing Number,${pcaLeftNum}\n`;
        csvContent += `PCA Right Hearing Number,${pcaRightNum}\n\n`;
    }
    // 4. Handle different test modes for the table rows
    if (testmode === "both") {
        const results = JSON.parse(sessionStorage.getItem("bothResults")) || [];
        const responses = JSON.parse(sessionStorage.getItem("bothResponses")) || [];
        csvContent += "Frequency (Hz),Both Ears Threshold (dB SPL)\n";
        
        results.forEach((db, index) => {
            csvContent += `${freqLabels[index]},${db}\n`;
        });

     // 1. Add a header for the trials section
        csvContent += "\n--- TRIAL-BY-TRIAL LOG ---\n";
        csvContent += "Ear (1=L 2=R 3=B),Frequency (Hz),Level (dB HL),Response (Yes/No)\n";

        // 2. Loop through and add each trial
        responses.forEach((item) => {
            csvContent += `${item.ear},${item.frequency},${item.levelHL},${item.response}\n`;
        });


    } else {
        const leftResults = JSON.parse(sessionStorage.getItem("leftResults")) || [];
        const rightResults = JSON.parse(sessionStorage.getItem("rightResults")) || [];
        const leftResponses = JSON.parse(sessionStorage.getItem("leftResponses")) || [];
        const rightResponses = JSON.parse(sessionStorage.getItem("rightResponses")) || [];
        csvContent += "Frequency (Hz),Left Ear Threshold (dB),Right Ear Threshold (dB)\n";
        
        // Loop through the frequencies and pull from both ear arrays
        freqLabels.forEach((freq, index) => {
            const leftDB = leftResults[index] || "--";
            const rightDB = rightResults[index] || "--";
            csvContent += `${freq},${leftDB},${rightDB}\n`;
        });

        csvContent += "\n--- TRIAL-BY-TRIAL LOG ---\n";
        csvContent += "Ear (1=L 2=R 3=B),Frequency (Hz),Level (dB HL),Response (Yes/No)\n";
        
        // Combine both ear response arrays into one list
        const allTrials = [...leftResponses, ...rightResponses];

        allTrials.forEach((item) => {
            // This pulls the properties from the objects you pushed in promptUser
            csvContent += `${item.ear},${item.frequency},${item.levelHL},${item.response}\n`;
        });
   
  
    }
    const pcaResult = runPCA();
    const recon = pcaResult.reconstructed[0];
    // recon order: [age, sex, 500R, 1kR, 2kR, 4kR, 500L, 1kL, 2kL, 4kL]

    // map frequencies to their index in recon
    const pcaByFreq = {
        500:  { right: recon[2], left: recon[6] },
        1000: { right: recon[3], left: recon[7] },
        2000: { right: recon[4], left: recon[8] },
        4000: { right: recon[5], left: recon[9] }
    };

    csvContent += "Frequency (Hz),PCA Left Ear Threshold (dB),PCA Right Ear Threshold (dB)\n";
    freqLabels.forEach((freq) => {
        const leftVal  = Math.round(pcaByFreq[freq].left * 10) / 10;
        const rightVal = Math.round(pcaByFreq[freq].right * 10) / 10;
        csvContent += `${freq},${leftVal},${rightVal}\n`;
    });
    csvContent += "\n";
    return csvContent;
}

function autoSaveCSV() {
    const csvData = generateCSV();
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    // Naming the file with the date
    const now = new Date();
    const fileTimestamp = now.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit'
    }).replace(/\//g, '-')  // turns 03/05/2026 into 03-05-2026
    + '_' +
    now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).replace(/:/g, '-').replace(' ', '');  // turns 02:45 PM into 02-45PM

    link.setAttribute("download", `Hearing_Results_${fileTimestamp}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Trigger as soon as the results page finishes loading
window.onload = () => {
    // Optional: add a tiny delay (500ms) to ensure everything is rendered
    setTimeout(autoSaveCSV, 500); 
};


let restart = document.querySelector("#restartBtn");
restart.addEventListener("click", ()=> {
    window.location.href = "../index.html";
});

