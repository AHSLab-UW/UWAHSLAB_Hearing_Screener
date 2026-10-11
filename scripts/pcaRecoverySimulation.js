// Ground-truth recovery simulations for the PCA + psychometric fit.
// Usage: node scripts/pcaRecoverySimulation.js [report.json] [repetitions] [experiments]
//   experiments: comma-separated subset of "calibration,lapse,mcl" (default: calibration,lapse).
// Experiment "calibration": a frequency-independent output attenuation (dB) is applied to every
//   stimulus of a simulated test, i.e. the listener hears levelHL - attenuation.
// Experiment "lapse": on a proportion of trials the listener ignores the tone and answers
//   Yes/No at random (50/50).
// Experiment "mcl": per-test offset from the perceptual MCL calibration. The listener's MCL
//   deviates from the assumed 75 dB SPL by e = mclSlope * max(0, betterEarPTA - mclKnee) + mclSD * z,
//   z ~ N(0, 1); every stimulus is then e dB louder than intended (attenuationDB = -e).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const frequencies = [500, 1000, 2000, 4000];
const ages = [25, 45, 65, 80];
const sexes = ["male", "female"];
const modes = ["single", "both"];
const repetitions = Number(process.argv[3] || 1);
const selectedExperiments = (process.argv[4] || "calibration,lapse").split(",");
const attenuationsDB = [-20, -10, 0, 10, 20, 30];
const lapseRates = [0, 0.05, 0.1, 0.2, 0.3, 0.5];
const mclSDs = [0, 4, 8, 12];
const mclSlope = 0.2;
const mclKnee = 20;
const slopeDB = 5;

// Load the model outside vm: vm global lookups make the grid fit ~25x slower.
const model = new Function(
    fs.readFileSync(path.join(root, "js", "ageEligibility.js"), "utf8") +
    fs.readFileSync(path.join(root, "js", "pca.js"), "utf8") +
    "; return { fitPCAPsychometric, DEFAULT_FIT_OPTIONS };"
)();
const methods = {
    legacyUnitPrior: { ...model.DEFAULT_FIT_OPTIONS, scoreSD: [1, 1, 1], rangeSD: 4, stepSD: 0.5 },
    scaledPrior: model.DEFAULT_FIT_OPTIONS
};

function randomGenerator(seed) {
    return () => {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

// Standard normal draw from a stream independent of the response stream.
function gaussian(seed) {
    const random = randomGenerator((seed * 7919 + 104729) >>> 0);
    random();
    return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

function createStaircase(age, sex, mode) {
    const stored = new Map([["userAge", String(age)], ["userSex", sex], ["testmode", mode]]);
    const context = vm.createContext({
        console: { log() {} },
        AudioContext: class {
            createGain() { return { connect() {} }; }
            createStereoPanner() { return { connect() {} }; }
        },
        sessionStorage: {
            getItem: key => stored.get(key) ?? null,
            setItem: (key, value) => stored.set(key, String(value))
        },
        document: { querySelector: () => ({ addEventListener() {} }), querySelectorAll: () => [] },
        window: { location: {} },
        runPCA: () => null
    });
    for (const file of ["ageEligibility.js", "perceptualCalibration.js", "playAudio.js"]) {
        vm.runInContext(fs.readFileSync(path.join(root, "js", file), "utf8"), context);
    }
    vm.runInContext("playTestTone = () => {};", context);
    return { context, stored };
}

function probability(threshold, level) {
    return 1 / (1 + Math.exp(-(level - threshold) / slopeDB));
}

function simulateTrials(age, sex, mode, truth, random, { attenuationDB = 0, lapseRate = 0 } = {}) {
    const { context, stored } = createStaircase(age, sex, mode);
    for (let count = 0; !context.window.location.href; count++) {
        assert.ok(count < 1000, "The simulated test failed to terminate in 1000 trials.");
        const trial = vm.runInContext("({ ear: state.currentEar, frequency: state.frequencies[state.freqIndex], levelHL: state.currentDBHL })", context);
        const index = frequencies.indexOf(trial.frequency);
        const heardLevel = trial.levelHL - attenuationDB;
        const pYes = mode === "both"
            ? 1 - (1 - probability(truth[0][index], heardLevel)) * (1 - probability(truth[1][index], heardLevel))
            : probability(truth[trial.ear === "right" ? 0 : 1][index], heardLevel);
        // Draw both numbers every trial so lapse and non-lapse runs share random streams.
        const lapse = random() < lapseRate;
        const draw = random();
        const yes = lapse ? draw < 0.5 : draw < pYes;
        context.promptUser({ currentTarget: { id: yes ? "yes" : "no" } });
    }
    const appOrder = vm.runInContext("state.frequencies", context);
    const rawFor = key => frequencies.map(frequency => JSON.parse(stored.get(key))[appOrder.indexOf(frequency)]);
    const trials = mode === "both"
        ? JSON.parse(stored.get("bothResponses"))
        : [...JSON.parse(stored.get("leftResponses")), ...JSON.parse(stored.get("rightResponses"))];
    // Raw staircase thresholds (last Yes level) in [R500..R4k, L500..L4k] order.
    const rawStaircase = mode === "both"
        ? [...rawFor("bothResults"), ...rawFor("bothResults")]
        : [...rawFor("rightResults"), ...rawFor("leftResults")];
    return { trials, rawStaircase };
}

function unpooledFit(trials, mode) {
    // Independent per-ear, per-frequency logistic ML control: no PCA, prior or exclusions.
    // In both-ears mode one threshold per frequency is fitted and used for both ears.
    return ["right", "left"].flatMap(ear => frequencies.map(frequency => {
        const selected = trials.filter(trial =>
            (mode === "both" || trial.ear === ear) && trial.frequency === frequency);
        let best = { threshold: 0, likelihood: -Infinity };
        for (let threshold = -20; threshold <= 100; threshold += 0.5) {
            const likelihood = selected.reduce((sum, trial) => {
                const p = probability(threshold, trial.levelHL);
                return sum + Math.log(Math.max(1e-15, trial.response === "yes" ? p : 1 - p));
            }, 0);
            if (likelihood > best.likelihood) best = { threshold, likelihood };
        }
        return best.threshold;
    }));
}

const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;

// Single-ear mode scores all eight thresholds; both-ears mode can only identify the better ear.
function scoredValues(thresholds, mode) {
    if (mode === "single") return thresholds;
    return frequencies.map((_, index) => Math.min(thresholds[index], thresholds[index + 4]));
}

function metrics(estimated, truth, mode) {
    const e = scoredValues(estimated, mode);
    const t = scoredValues(truth, mode);
    const errors = e.map((value, index) => value - t[index]);
    const hearingNumberError = mode === "single"
        ? average([average(e.slice(0, 4)) - average(t.slice(0, 4)), average(e.slice(4)) - average(t.slice(4))].map(Math.abs))
        : Math.abs(average(e) - average(t));
    return {
        mae: average(errors.map(Math.abs)),
        bias: average(errors),
        within5: average(errors.map(error => Math.abs(error) <= 5 ? 1 : 0)),
        hearingNumberError,
        squaredError: average(errors.map(error => error ** 2))
    };
}

const profiles = [
    ...[0, 20, 40, 60].map(level => ({ name: `Flat ${level}`, truth: [Array(4).fill(level), Array(4).fill(level)] })),
    { name: "High-frequency 5/5/15/35", truth: [[5, 5, 15, 35], [5, 5, 15, 35]] },
    { name: "Sloping 10/20/40/60", truth: [[10, 20, 40, 60], [10, 20, 40, 60]] },
    { name: "Asymmetric R10 / L50", truth: [Array(4).fill(10), Array(4).fill(50)] }
];

function evaluate(age, sex, mode, profile, seed, perturbation) {
    let mclOffsetDB;
    if (perturbation.mclSD !== undefined) {
        const [right, left] = profile.truth.map(ear => average(ear));
        mclOffsetDB = mclSlope * Math.max(0, Math.min(right, left) - mclKnee) + perturbation.mclSD * gaussian(seed);
        perturbation = { attenuationDB: -mclOffsetDB };
    }
    const { trials, rawStaircase } = simulateTrials(age, sex, mode, profile.truth, randomGenerator(seed), perturbation);
    const truth = profile.truth.flat();
    const run = { mode, age, sex, profile: profile.name, seed, trialCount: trials.length, mclOffsetDB, methods: {} };
    run.methods.rawStaircase = { ...metrics(rawStaircase, truth, mode), excludedFraction: 0 };
    run.methods.unpooledControl = { ...metrics(unpooledFit(trials, mode), truth, mode), excludedFraction: 0 };
    for (const [name, options] of Object.entries(methods)) {
        const result = model.fitPCAPsychometric(trials, mode, age, sex === "male" ? 1 : 2, options);
        const recovered = Array.from(result.reconstructed[0].slice(2));
        assert.ok(recovered.every(Number.isFinite));
        run.methods[name] = { ...metrics(recovered, truth, mode), excludedFraction: result.excludedTrialCount / trials.length };
    }
    return run;
}

function summarize(selected) {
    const names = Object.keys(selected[0].methods);
    const round = value => Math.round(value * 10) / 10;
    return Object.fromEntries(names.map(name => {
        const values = selected.map(run => run.methods[name]);
        return [name, {
            maeDB: round(average(values.map(v => v.mae))),
            rmseDB: round(Math.sqrt(average(values.map(v => v.squaredError)))),
            biasDB: round(average(values.map(v => v.bias))),
            within5Percent: round(100 * average(values.map(v => v.within5))),
            hearingNumberErrorDB: round(average(values.map(v => v.hearingNumberError))),
            excludedPercent: round(100 * average(values.map(v => v.excludedFraction)))
        }];
    }));
}

function groupBy(runs, keyOf) {
    const groups = {};
    for (const run of runs) (groups[keyOf(run)] ||= []).push(run);
    return Object.fromEntries(Object.entries(groups).map(([key, selected]) => [key, summarize(selected)]));
}

// Least-squares slope of mean bias against attenuation: 1 = calibration error passes straight
// through to the reported thresholds, 0 = fully rejected.
function biasSlopes(byLevel) {
    const levels = Object.keys(byLevel).map(Number);
    const names = Object.keys(byLevel[levels[0]]);
    const meanLevel = average(levels);
    return Object.fromEntries(names.map(name => {
        const biases = levels.map(level => byLevel[level][name].biasDB);
        const meanBias = average(biases);
        const slope = levels.reduce((sum, level, i) => sum + (level - meanLevel) * (biases[i] - meanBias), 0) /
            levels.reduce((sum, level) => sum + (level - meanLevel) ** 2, 0);
        return [name, Math.round(slope * 100) / 100];
    }));
}

const experiments = {
    calibration: { parameter: "attenuationDB", levels: attenuationsDB },
    lapse: { parameter: "lapseRate", levels: lapseRates },
    mcl: { parameter: "mclSD", levels: mclSDs }
};

const report = {
    methodology: {
        ages, sexes, modes, repetitions, slopeDB, firstSeed: 20261010, mclSlope, mclKnee,
        profiles: profiles.map(profile => profile.name),
        scaledScoreSD: methods.scaledPrior.scoreSD,
        note: "Executes the app staircase (playAudio.js) and fitPCAPsychometric. Errors are against the true (unattenuated) thresholds. The same random seeds are reused at every level of an experiment (common random numbers). Both-ears mode is scored on better-ear thresholds only. rawStaircase is the app's unmodelled last-Yes level; unpooledControl is a per-frequency logistic fit without PCA."
    },
    experiments: {}
};

for (const name of selectedExperiments) {
    const { parameter, levels } = experiments[name];
    const runs = [];
    for (const level of levels) {
        let seed = 20261010;
        for (const mode of modes) for (const age of ages) for (const sex of sexes) for (const profile of profiles) {
            for (let repetition = 0; repetition < repetitions; repetition++) {
                runs.push({ [parameter]: level, ...evaluate(age, sex, mode, profile, seed++, { [parameter]: level }) });
            }
        }
        process.stderr.write(`done ${name} ${parameter}=${level}\n`);
    }
    const byMode = Object.fromEntries(modes.map(mode => [mode,
        groupBy(runs.filter(run => run.mode === mode), run => run[parameter])]));
    report.experiments[name] = {
        parameter, levels, byMode,
        byModeAndProfile: Object.fromEntries(modes.map(mode => [mode,
            groupBy(runs.filter(run => run.mode === mode), run => `${run.profile} | ${run[parameter]}`)])),
        byModeAndDemographic: Object.fromEntries(modes.map(mode => [mode,
            groupBy(runs.filter(run => run.mode === mode), run => `${run.age} ${run.sex} | ${run[parameter]}`)])),
        ...(name === "calibration" ? { biasSlopeByMode: Object.fromEntries(modes.map(mode => [mode, biasSlopes(byMode[mode])])) } : {}),
        runs
    };
}

const printable = Object.fromEntries(Object.entries(report.experiments).map(([name, experiment]) =>
    [name, { byMode: experiment.byMode, biasSlopeByMode: experiment.biasSlopeByMode }]));
console.log(JSON.stringify(printable, null, 1));
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n");
