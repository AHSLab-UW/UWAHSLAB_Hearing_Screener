const mean = [43.67098781436349, 1.4894996110967074, 14.68343271973036, 14.862328234379051, 15.25745397977703, 23.415867254342754, 13.516204303863105, 13.67487684729064, 14.408348457350272, 23.17241379310345];
const weights = [
    [0.013564490137942193, 0.000349446262239326, 0.09374316970705628],
    [-0.0001232126056166516, -0.0002950878950020554, -0.0018082671556814978],
    [0.36670048790788584, 0.2309825228685524, -0.35290216254426804],
    [0.36884638285455357, 0.2324095562104278, -0.3315594897166317],
    [0.38519282746135086, 0.3296509715180547, -0.16382662810862783],
    [0.4125237838056605, 0.45535269452487964, 0.5872226864390946],
    [0.3123787922119594, -0.3812287543364457, -0.18737397897644273],
    [0.2938820832503796, -0.38926501687591136, -0.17228020072858097],
    [0.32577057857390035, -0.37373003707631924, -0.04742292428207023],
    [0.34738457417164237, -0.3742727168503456, 0.563940830140357]
];

const PCA_SCORE_RANGE = 4;
const PCA_SCORE_STEP = 0.5;
const PSYCHOMETRIC_SLOPE_DB = 5;
const LOOCV_RESPONSE_CUTOFF = 0.05;
const PCA_SCORE_AXIS = (() => {
    const values = [];
    for (let score = -PCA_SCORE_RANGE; score <= PCA_SCORE_RANGE; score += PCA_SCORE_STEP) {
        values.push(Number(score.toFixed(6)));
    }
    return values;
})();

function createScoreGrid(priorMean) {
    return PCA_SCORE_AXIS.flatMap(a =>
        PCA_SCORE_AXIS.flatMap(b =>
            PCA_SCORE_AXIS.map(c => [
                a + priorMean[0],
                b + priorMean[1],
                c + priorMean[2]
            ])
        )
    );
}

function stableSigmoid(value) {
    if (value >= 0) {
        return 1 / (1 + Math.exp(-value));
    }
    const exp = Math.exp(value);
    return exp / (1 + exp);
}

function logProbability(probability) {
    return Math.log(Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, probability)));
}

function reconstructFromScores(scores) {
    return mean.map((value, row) =>
        value + weights[row].reduce((sum, loading, component) =>
            sum + loading * scores[component], 0)
    );
}

function thresholdIndexes(frequency) {
    const frequencyIndex = [500, 1000, 2000, 4000].indexOf(Number(frequency));
    if (frequencyIndex < 0) {
        throw new Error(`Unsupported trial frequency: ${frequency}`);
    }
    return { right: frequencyIndex + 2, left: frequencyIndex + 6 };
}

function probabilityYes(thresholds, trial, testMode) {
    const indexes = thresholdIndexes(trial.frequency);
    const rightProbability = stableSigmoid(
        (trial.levelHL - thresholds[indexes.right]) / PSYCHOMETRIC_SLOPE_DB
    );
    if (testMode === "both") {
        const leftProbability = stableSigmoid(
            (trial.levelHL - thresholds[indexes.left]) / PSYCHOMETRIC_SLOPE_DB
        );
        return 1 - (1 - rightProbability) * (1 - leftProbability);
    }
    const thresholdIndex = trial.ear === "left" ? indexes.left : indexes.right;
    return stableSigmoid(
        (trial.levelHL - thresholds[thresholdIndex]) / PSYCHOMETRIC_SLOPE_DB
    );
}

function validateTrials(trials, testMode) {
    if (!Array.isArray(trials) || trials.length === 0) {
        throw new Error("No trial-by-trial responses are available for PCA fitting.");
    }
    return trials.map((trial, index) => {
        const response = String(trial.response || "").toLowerCase();
        if (!["yes", "no"].includes(response)) {
            throw new Error(`Trial ${index + 1} has an invalid response.`);
        }
        if (!Number.isFinite(Number(trial.levelHL))) {
            throw new Error(`Trial ${index + 1} has an invalid sound level.`);
        }
        thresholdIndexes(trial.frequency);
        if (testMode !== "both" && !["left", "right"].includes(trial.ear)) {
            throw new Error(`Trial ${index + 1} has an invalid ear.`);
        }
        return { ...trial, levelHL: Number(trial.levelHL), response };
    });
}

function buildGridLikelihoods(trials, testMode, scoreGrid) {
    return scoreGrid.map(scores => {
        const thresholds = reconstructFromScores(scores);
        return trials.map(trial => probabilityYes(thresholds, trial, testMode));
    });
}

function posteriorWeights(likelihoods, trials, scoreGrid, priorMean, omittedIndex = -1) {
    const logPosterior = scoreGrid.map((scores, gridIndex) => {
        let logWeight = -0.5 * scores.reduce((sum, score, component) =>
            sum + (score - priorMean[component]) ** 2, 0
        );
        for (let trialIndex = 0; trialIndex < trials.length; trialIndex++) {
            if (trialIndex === omittedIndex) continue;
            const pYes = likelihoods[gridIndex][trialIndex];
            logWeight += logProbability(trials[trialIndex].response === "yes" ? pYes : 1 - pYes);
        }
        return logWeight;
    });

    const maxLogWeight = Math.max(...logPosterior);
    const unnormalized = logPosterior.map(value => Math.exp(value - maxLogWeight));
    const total = unnormalized.reduce((sum, value) => sum + value, 0);
    return unnormalized.map(value => value / total);
}

function posteriorMeanScores(posterior, scoreGrid) {
    return [0, 1, 2].map(component =>
        posterior.reduce((sum, weight, gridIndex) =>
            sum + weight * scoreGrid[gridIndex][component], 0)
    );
}

function leaveOneOutProbabilities(trials, likelihoods, scoreGrid, priorMean) {
    return trials.map((trial, omittedIndex) => {
        const posterior = posteriorWeights(likelihoods, trials, scoreGrid, priorMean, omittedIndex);
        const predictedYes = posterior.reduce((sum, weight, gridIndex) =>
            sum + weight * likelihoods[gridIndex][omittedIndex], 0
        );
        return trial.response === "yes" ? predictedYes : 1 - predictedYes;
    });
}

function runPCA() {
    const age = Number(sessionStorage.getItem("userAge"));
    const sexInput = sessionStorage.getItem("userSex");
    if (!["male", "female"].includes(sexInput)) {
        throw new Error("A valid sex selection is required for PCA fitting.");
    }
    const sex = sexInput === "male" ? 1 : 2;
    const testMode = sessionStorage.getItem("testmode");
    if (!isEligibleAdultAge(age)) {
        throw new Error("This hearing screening tool requires an adult age in whole years, from 18 to 120.");
    }
    if (!["single", "both"].includes(testMode)) {
        throw new Error(`Unsupported test mode: ${testMode}`);
    }

    const storedTrials = testMode === "both"
        ? JSON.parse(sessionStorage.getItem("bothResponses") || "[]")
        : [
            ...JSON.parse(sessionStorage.getItem("leftResponses") || "[]"),
            ...JSON.parse(sessionStorage.getItem("rightResponses") || "[]")
        ];
    const trials = validateTrials(storedTrials, testMode);
    const priorMean = [
        (age - mean[0]) * weights[0][0] + (sex - mean[1]) * weights[1][0],
        (age - mean[0]) * weights[0][1] + (sex - mean[1]) * weights[1][1],
        (age - mean[0]) * weights[0][2] + (sex - mean[1]) * weights[1][2]
    ];
    const scoreGrid = createScoreGrid(priorMean);
    const likelihoods = buildGridLikelihoods(trials, testMode, scoreGrid);
    const loocvProbabilities = leaveOneOutProbabilities(trials, likelihoods, scoreGrid, priorMean);
    const excludedTrials = [];
    const includedTrials = trials.filter((trial, index) => {
        const include = loocvProbabilities[index] >= LOOCV_RESPONSE_CUTOFF;
        if (!include) excludedTrials.push(index);
        return include;
    });

    const finalLikelihoods = buildGridLikelihoods(includedTrials, testMode, scoreGrid);
    const posterior = posteriorWeights(finalLikelihoods, includedTrials, scoreGrid, priorMean);
    const scores = posteriorMeanScores(posterior, scoreGrid);
    const reconstructed = reconstructFromScores(scores);
    const trialDiagnostics = trials.map((trial, index) => ({
        ...trial,
        observedResponseProbability: loocvProbabilities[index],
        excluded: excludedTrials.includes(index)
    }));

    return {
        scores: [scores],
        reconstructed: [reconstructed],
        trialDiagnostics,
        includedTrialCount: includedTrials.length,
        excludedTrialCount: excludedTrials.length
    };
}
