const resultFrequencies = [500, 1000, 2000, 4000];
let fittedPCAResult = null;

document.addEventListener("DOMContentLoaded", loadContent);

function loadContent() {
    try {
        fittedPCAResult = runPCA();
        displayPCAResults(fittedPCAResult);
    } catch (error) {
        console.error("Unable to fit the PCA psychometric model:", error);
        document.getElementById("pcaError").textContent =
            `The PCA-estimated thresholds could not be calculated: ${error.message}`;
    }
}

function displayPCAResults(result) {
    const recon = result.reconstructed[0];
    const rightThresholds = recon.slice(2, 6);
    const leftThresholds = recon.slice(6, 10);
    const rightPTA4 = average(rightThresholds);
    const leftPTA4 = average(leftThresholds);

    document.getElementById("leftThreshold").textContent =
        `Left ear PTA4: ${Math.round(leftPTA4)} dB HL`;
    document.getElementById("rightThreshold").textContent =
        `Right ear PTA4: ${Math.round(rightPTA4)} dB HL`;

    resultFrequencies.forEach((frequency, index) => {
        document.getElementById(`valL${index}`).textContent =
            `${formatThreshold(leftThresholds[index])} dB HL`;
        document.getElementById(`valR${index}`).textContent =
            `${formatThreshold(rightThresholds[index])} dB HL`;
    });

    const excludedCount = result.excludedTrialCount;
    document.getElementById("pcaFitStatus").textContent = result.includedTrialCount === 0
        ? `No responses passed LOOCV; thresholds reflect the age/sex-informed PCA prior only. ` +
          `All ${result.trialDiagnostics.length} responses were excluded.`
        : `PCA + psychometric fit used ${result.includedTrialCount} of ${result.trialDiagnostics.length} trials; ` +
          `${excludedCount} unlikely response${excludedCount === 1 ? " was" : "s were"} excluded by LOOCV.`;
    sessionStorage.setItem("pcaLeftNum", String(Math.round(leftPTA4)));
    sessionStorage.setItem("pcaRightNum", String(Math.round(rightPTA4)));
}

function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatThreshold(value) {
    return (Math.round(value * 10) / 10).toFixed(1);
}

function getAllTrials(testmode) {
    if (testmode === "both") {
        return JSON.parse(sessionStorage.getItem("bothResponses") || "[]");
    }
    return [
        ...JSON.parse(sessionStorage.getItem("leftResponses") || "[]"),
        ...JSON.parse(sessionStorage.getItem("rightResponses") || "[]")
    ];
}

function generateCSV() {
    const now = new Date();
    const startTime = sessionStorage.getItem("startTime") || "Not Provided";
    const testmode = sessionStorage.getItem("testmode");
    const allTrials = getAllTrials(testmode);
    const age = sessionStorage.getItem("userAge") || "Not Provided";
    const sex = sessionStorage.getItem("userSex") || "Not Provided";
    const difficulty = sessionStorage.getItem("likertResponse") || "Not Provided";
    const device = sessionStorage.getItem("hearingDevice") || "Not Provided";
    const confidence = sessionStorage.getItem("confidenceLevel") || "Not Provided";

    let csvContent = `Test Date and Start Time:,${startTime}\n`;
    csvContent += `Test End Time:,${now.toLocaleTimeString()}\n`;
    csvContent += `Age,${age}\n`;
    csvContent += `Sex,${sex}\n`;
    csvContent += `Subjective Difficulty,${difficulty}\n`;
    csvContent += `Device Usage Likelihood,${device}\n`;
    csvContent += `Confidence Level,${confidence}\n\n`;

    if (fittedPCAResult) {
        const recon = fittedPCAResult.reconstructed[0];
        csvContent += "PCA + Psychometric PTA4 (dB HL)\n";
        csvContent += `Left ear,${Math.round(average(recon.slice(6, 10)))}\n`;
        csvContent += `Right ear,${Math.round(average(recon.slice(2, 6)))}\n\n`;
        csvContent += "Frequency (Hz),PCA Left Threshold (dB HL),PCA Right Threshold (dB HL)\n";
        resultFrequencies.forEach((frequency, index) => {
            csvContent += `${frequency},${formatThreshold(recon[index + 6])},${formatThreshold(recon[index + 2])}\n`;
        });
        csvContent += `Trials used,${fittedPCAResult.includedTrialCount}\n`;
        csvContent += `Trials excluded by LOOCV,${fittedPCAResult.excludedTrialCount}\n\n`;
        if (fittedPCAResult.includedTrialCount === 0) {
            csvContent += "Estimate basis,Age/sex-informed PCA prior only; no trials passed LOOCV\n\n";
        }
    } else {
        csvContent += "PCA + Psychometric model,Not available\n\n";
    }

    csvContent += "--- RAW TRIAL-BY-TRIAL LOG ---\n";
    csvContent += "Ear,Frequency (Hz),Level (dB HL),Response (Yes/No)\n";
    allTrials.forEach(trial => {
        csvContent += `${trial.ear},${trial.frequency},${trial.levelHL},${trial.response}\n`;
    });

    if (fittedPCAResult) {
        csvContent += "\n--- LOOCV RESPONSE DIAGNOSTICS ---\n";
        csvContent += "Ear,Frequency (Hz),Level (dB HL),Response,LOOCV probability of observed response,Excluded from fit\n";
        fittedPCAResult.trialDiagnostics.forEach(trial => {
            csvContent += `${trial.ear},${trial.frequency},${trial.levelHL},${trial.response},` +
                `${trial.observedResponseProbability.toFixed(6)},${trial.excluded ? "Yes" : "No"}\n`;
        });
    }
    return csvContent;
}

function autoSaveCSV() {
    const csvData = generateCSV();
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);

    const now = new Date();
    const fileTimestamp = now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).replace(/\//g, "-") + "_" + now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    }).replace(/:/g, "-").replace(" ", "");
    link.setAttribute("download", `Hearing_Results_${fileTimestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

window.onload = () => {
    setTimeout(autoSaveCSV, 500);
};

document.querySelector("#restartBtn").addEventListener("click", () => {
    window.location.href = "../index.html";
});
