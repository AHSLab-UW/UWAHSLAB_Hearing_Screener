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

// The trained loading columns have unit L2 norm, so scores are in dB-like units and their
// variance is the PCA eigenvalue, not 1. These SDs are provisional estimates chosen to imply
// adult NHANES threshold SDs of about 10-13 dB; replace them with sqrt(explained_variance_)
// from the NHANES training run when available.
const PCA_SCORE_SD = [24, 12, 10];
// Score grid in prior-SD units around the age/sex prior mean.
const PCA_SCORE_RANGE_SD = 6;
const PCA_SCORE_STEP_SD = 0.25;
const PSYCHOMETRIC_SLOPE_DB = 5;
const LOOCV_RESPONSE_CUTOFF = 0.05;
const DEFAULT_FIT_OPTIONS = {
    scoreSD: PCA_SCORE_SD,
    rangeSD: PCA_SCORE_RANGE_SD,
    stepSD: PCA_SCORE_STEP_SD,
    slopeDB: PSYCHOMETRIC_SLOPE_DB,
    loocvCutoff: LOOCV_RESPONSE_CUTOFF
};

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

function probabilityYes(thresholds, trial, testMode, slopeDB = PSYCHOMETRIC_SLOPE_DB) {
    const indexes = thresholdIndexes(trial.frequency);
    const rightProbability = stableSigmoid(
        (trial.levelHL - thresholds[indexes.right]) / slopeDB
    );
    if (testMode === "both") {
        const leftProbability = stableSigmoid(
            (trial.levelHL - thresholds[indexes.left]) / slopeDB
        );
        return 1 - (1 - rightProbability) * (1 - leftProbability);
    }
    const thresholdIndex = trial.ear === "left" ? indexes.left : indexes.right;
    return stableSigmoid(
        (trial.levelHL - thresholds[thresholdIndex]) / slopeDB
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

function priorMeanScores(age, sex) {
    return [0, 1, 2].map(component =>
        (age - mean[0]) * weights[0][component] + (sex - mean[1]) * weights[1][component]
    );
}

function createScoreGrid(priorMean, options = DEFAULT_FIT_OPTIONS) {
    const axis = [];
    const halfSteps = Math.round(options.rangeSD / options.stepSD);
    for (let step = -halfSteps; step <= halfSteps; step++) axis.push(step * options.stepSD);
    const size = axis.length ** 3;
    const scores = new Float64Array(size * 3);
    const thresholds = new Float64Array(size * mean.length);
    const logPrior = new Float64Array(size);
    let point = 0;
    for (const a of axis) for (const b of axis) for (const c of axis) {
        const pointScores = [
            priorMean[0] + a * options.scoreSD[0],
            priorMean[1] + b * options.scoreSD[1],
            priorMean[2] + c * options.scoreSD[2]
        ];
        scores.set(pointScores, point * 3);
        thresholds.set(reconstructFromScores(pointScores), point * mean.length);
        logPrior[point] = -0.5 * (a * a + b * b + c * c);
        point++;
    }
    return { size, scores, thresholds, logPrior };
}

function compileTrials(trials, testMode) {
    return trials.map(trial => {
        const indexes = thresholdIndexes(trial.frequency);
        return {
            first: testMode === "both" || trial.ear === "right" ? indexes.right : indexes.left,
            second: testMode === "both" ? indexes.left : -1,
            levelHL: trial.levelHL,
            yes: trial.response === "yes"
        };
    });
}

function compiledProbabilityYes(grid, point, trial, slopeDB) {
    const offset = point * mean.length;
    const first = stableSigmoid((trial.levelHL - grid.thresholds[offset + trial.first]) / slopeDB);
    if (trial.second < 0) return first;
    const second = stableSigmoid((trial.levelHL - grid.thresholds[offset + trial.second]) / slopeDB);
    return 1 - (1 - first) * (1 - second);
}

function gridLogPosterior(grid, compiledTrials, slopeDB) {
    const logPosterior = new Float64Array(grid.size);
    let maximum = -Infinity;
    for (let point = 0; point < grid.size; point++) {
        let value = grid.logPrior[point];
        for (const trial of compiledTrials) {
            const pYes = compiledProbabilityYes(grid, point, trial, slopeDB);
            value += logProbability(trial.yes ? pYes : 1 - pYes);
        }
        logPosterior[point] = value;
        if (value > maximum) maximum = value;
    }
    return { logPosterior, maximum };
}

// Exact grid posterior with leave-one-out predictions. Each held-out posterior is the full
// posterior divided by that trial's likelihood, so LOOCV costs two grid passes, not N + 1.
function fitPCAPsychometric(rawTrials, testMode, age, sex, options = DEFAULT_FIT_OPTIONS) {
    const trials = validateTrials(rawTrials, testMode);
    const compiledTrials = compileTrials(trials, testMode);
    const grid = createScoreGrid(priorMeanScores(age, sex), options);
    const full = gridLogPosterior(grid, compiledTrials, options.slopeDB);

    const heldOutWeight = new Float64Array(trials.length);
    const heldOutYes = new Float64Array(trials.length);
    for (let point = 0; point < grid.size; point++) {
        const relative = full.logPosterior[point] - full.maximum;
        if (relative < -60) continue;
        compiledTrials.forEach((trial, trialIndex) => {
            const pYes = compiledProbabilityYes(grid, point, trial, options.slopeDB);
            const weight = Math.exp(relative - logProbability(trial.yes ? pYes : 1 - pYes));
            heldOutWeight[trialIndex] += weight;
            heldOutYes[trialIndex] += weight * pYes;
        });
    }
    const loocvProbabilities = trials.map((trial, index) => {
        const predictedYes = heldOutYes[index] / heldOutWeight[index];
        return trial.response === "yes" ? predictedYes : 1 - predictedYes;
    });
    const excluded = loocvProbabilities.map(probability => probability < options.loocvCutoff);
    const includedTrials = compiledTrials.filter((trial, index) => !excluded[index]);

    const final = gridLogPosterior(grid, includedTrials, options.slopeDB);
    let totalWeight = 0;
    const scores = [0, 0, 0];
    for (let point = 0; point < grid.size; point++) {
        const weight = Math.exp(final.logPosterior[point] - final.maximum);
        totalWeight += weight;
        for (let component = 0; component < 3; component++) {
            scores[component] += weight * grid.scores[point * 3 + component];
        }
    }
    const posteriorScores = scores.map(score => score / totalWeight);

    return {
        scores: [posteriorScores],
        reconstructed: [reconstructFromScores(posteriorScores)],
        trialDiagnostics: trials.map((trial, index) => ({
            ...trial,
            observedResponseProbability: loocvProbabilities[index],
            excluded: excluded[index]
        })),
        includedTrialCount: includedTrials.length,
        excludedTrialCount: trials.length - includedTrials.length
    };
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
    return fitPCAPsychometric(storedTrials, testMode, age, sex);
}
