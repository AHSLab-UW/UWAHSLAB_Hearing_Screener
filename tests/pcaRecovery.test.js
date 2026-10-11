const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const { fitPCAPsychometric } = new Function(
    fs.readFileSync(path.join(root, "js", "ageEligibility.js"), "utf8") +
    fs.readFileSync(path.join(root, "js", "pca.js"), "utf8") +
    "; return { fitPCAPsychometric };"
)();

// Deterministic responses: Yes at or above the true threshold, No below it.
function trialsFor(truth) {
    return ["right", "left"].flatMap((ear, earIndex) =>
        [500, 1000, 2000, 4000].flatMap((frequency, index) =>
            [-15, -10, -5, 5, 10, 15].map(offset => ({
                ear,
                frequency,
                levelHL: truth[earIndex][index] + offset,
                response: offset > 0 ? "yes" : "no"
            }))
        )
    );
}

for (const [label, truth] of [
    ["flat 0 dB HL", [[0, 0, 0, 0], [0, 0, 0, 0]]],
    ["flat 60 dB HL", [[60, 60, 60, 60], [60, 60, 60, 60]]],
    ["asymmetric 10 / 50 dB HL", [[10, 10, 10, 10], [50, 50, 50, 50]]]
]) {
    test(`fit recovers ${label} instead of collapsing to the PCA prior`, () => {
        for (const sex of [1, 2]) {
            for (const age of [25, 80]) {
                const result = fitPCAPsychometric(trialsFor(truth), "single", age, sex);
                const recovered = result.reconstructed[0].slice(2);
                truth.flat().forEach((expected, index) => {
                    assert.ok(Math.abs(recovered[index] - expected) <= 8,
                        `age ${age}, sex ${sex}, threshold ${index}: ${recovered[index].toFixed(1)} vs ${expected}`);
                });
                assert.equal(result.excludedTrialCount, 0);
            }
        }
    });
}

test("LOOCV still excludes a response that contradicts all other trials", () => {
    const trials = trialsFor([[20, 20, 20, 20], [20, 20, 20, 20]]);
    trials.push({ ear: "right", frequency: 1000, levelHL: 80, response: "no" });
    const result = fitPCAPsychometric(trials, "single", 45, 2);
    assert.equal(result.trialDiagnostics.at(-1).excluded, true);
    assert.equal(result.excludedTrialCount, 1);
});
