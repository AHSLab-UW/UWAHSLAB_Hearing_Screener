const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = name => fs.readFileSync(path.join(root, "js", name), "utf8");

function contextFor(mode = "right") {
    const stored = new Map([
        ["testmode", mode], ["userAge", "45"], ["userSex", "female"],
        ["leftResponses", JSON.stringify([{ ear: "left", frequency: 500, levelHL: 100, response: "no" }])],
        ["bothResponses", JSON.stringify([{ ear: "both", frequency: 500, levelHL: 100, response: "no" }])]
    ]);
    const elements = {};
    const handlers = {};
    const context = vm.createContext({
        sessionStorage: {
            getItem: key => stored.get(key) ?? null,
            setItem: (key, value) => stored.set(key, String(value))
        },
        document: {
            addEventListener() {},
            getElementById: id => id === "levelCalibrationPanel" ? null : (elements[id] ||= { textContent: "" }),
            querySelector: id => ({ addEventListener: (event, handler) => { handlers[id] = handler; } })
        },
        window: { location: {} },
        console
    });
    for (const file of ["ageEligibility.js", "perceptualCalibration.js", "pca.js", "results.js"]) {
        vm.runInContext(source(file), context);
    }
    return { context, stored, elements, handlers };
}

test("no-difference selection chooses right-only mode", () => {
    const { context, stored, handlers } = contextFor();
    vm.runInContext(source("startpage.js"), context);
    handlers["#bothEars"]();
    assert.equal(stored.get("testmode"), "right");
    assert.match(context.window.location.href, /TestingPage/);
    handlers["#singleEars"]();
    assert.equal(stored.get("testmode"), "single");
});

test("right-only likelihood does not depend on the inferred left ear", () => {
    const { context } = contextFor();
    const trial = { ear: "right", frequency: 1000, levelHL: 30, response: "yes" };
    const first = [45, 2, 20, 30, 40, 50, -10, -10, -10, -10];
    const second = [...first.slice(0, 6), 100, 100, 100, 100];
    assert.equal(context.probabilityYes(first, trial, "right"), 0.5);
    assert.equal(context.probabilityYes(second, trial, "right"), 0.5);
    assert.throws(() => context.validateTrials([{ ...trial, ear: "left" }], "right"), /invalid ear/);
    assert.throws(() => context.validateTrials([trial], "both"), /Unsupported test mode/);
});

test("right-only PCA ignores stale left/binaural logs and labels untested left-ear results in UI and CSV", () => {
    const { context, stored, elements } = contextFor();
    const trials = [500, 1000, 2000, 4000].flatMap(frequency =>
        [5, 10, 15, 25, 30, 35].map(levelHL => ({
            ear: "right", frequency, levelHL, response: levelHL >= 20 ? "yes" : "no"
        })));
    stored.set("rightResponses", JSON.stringify(trials));
    const result = context.runPCA();
    assert.equal(result.trialDiagnostics.length, trials.length);
    assert.ok(result.trialDiagnostics.every(trial => trial.ear === "right"));
    assert.ok(result.reconstructed[0].every(Number.isFinite));
    result.reconstructed[0].slice(2, 6).forEach(value => assert.ok(Math.abs(value - 20) < 8));
    context.loadContent();
    assert.match(elements.leftThreshold.textContent, /inferred; not tested/);
    assert.match(elements.leftHeader.textContent, /Inferred Threshold.*not tested/);
    assert.match(elements.rightHeader.textContent, /Estimated Threshold/);
    assert.match(elements.earInferenceNotice.textContent, /cannot rule out/);
    const csv = context.generateCSV();
    assert.match(csv, /Right ear only; left ear inferred and not tested/);
    assert.match(csv, /Left ear \(inferred; not tested\)/);
    assert.match(csv, /PCA Left Inferred Threshold \(dB HL; not tested\)/);
    assert.doesNotMatch(csv, /left,500,100,no|both,500,100,no/);
});

test("each-ear results remain labeled as estimates rather than untested inferences", () => {
    const { context, elements } = contextFor("single");
    context.displayPCAResults({
        reconstructed: [[45, 2, 10, 10, 10, 10, 30, 30, 30, 30]],
        includedTrialCount: 2, excludedTrialCount: 0, trialDiagnostics: [{}, {}]
    });
    assert.equal(elements.leftThreshold.textContent, "Left Ear: 30");
    assert.match(elements.leftHeader.textContent, /Estimated Threshold/);
    assert.match(elements.earInferenceNotice.textContent, /Both ears were tested separately/);
});
