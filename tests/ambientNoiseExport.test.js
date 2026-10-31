const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function exportContext(noise, calibration = null) {
    const stored = new Map([
        ["testmode", "right"],
        ["rightResponses", JSON.stringify([{ ear: "right", frequency: 1000, levelHL: 20, response: "yes" }])]
    ]);
    if (noise) stored.set("ambientNoiseTestAverage", JSON.stringify(noise));
    if (calibration) stored.set("levelCalibrationUsed", JSON.stringify(calibration));
    const context = vm.createContext({
        document: { addEventListener() {}, querySelector: () => ({ addEventListener() {} }) },
        window: {},
        sessionStorage: { getItem: key => stored.get(key) ?? null }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/perceptualCalibration.js"), "utf8"), context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/results.js"), "utf8"), context);
    return context;
}

test("CSV reports Medium anchor and calibration summaries without individual tracks", () => {
        const record = {
            schemaVersion: 4, method: "perceptual", loudnessLabel: "Medium",
            referenceListener: "normal-hearing", frequencyHz: 1000, targetDbSPL: 80,
            presentation: "monaural", ear: "right",
            gainOffsetDB: -6, settingCount: 4, settingSDDB: 1.6, settingRangeDB: 4,
            ascendingMinusDescendingDB: -2, consistent: true,
            completedAt: "2026-10-30T10:00:00Z", expiresAt: "2026-10-30T14:00:00Z"
        };
        const csv = exportContext(null, record).generateCSV();
        assert.match(csv, /Method,Perceptual Medium \(normal-hearing reference listener; right ear\)/);
        assert.match(csv, /Reference tone \(Hz\),1000/);
        assert.match(csv, /Medium level assumed \(dB SPL\),80/);
        assert.match(csv, /Presentation,Monaural \(right ear\)/);
        assert.match(csv, /Digital gain offset \(dB\),-6/);
        assert.match(csv, /Number of settings,4/);
        assert.match(csv, /Setting SD \(dB\),1\.6/);
        assert.match(csv, /Setting range \(dB\),4/);
        assert.match(csv, /Settings consistent \(range <= 12 dB\),Yes/);
        assert.match(csv, /Valid until,2026-10-30T14:00:00Z/);
        assert.doesNotMatch(csv, /direction:start|->|undefined|NaN|MCL|Binaural/);
    });

    test("CSV distinguishes physical calibration from assumed Medium and preserves historical MCL labels", () => {
        const common = { frequencyHz: 1000, gainOffsetDB: 0,
            completedAt: "2026-10-30T10:00:00Z", expiresAt: "2026-10-30T14:00:00Z" };
        const coupler = exportContext(null, { ...common, method: "coupler", targetDbSPL: 80 }).generateCSV();
        assert.match(coupler, /Method,Coupler \/ sound level meter/);
        assert.match(coupler, /Reference tone level assumed \(dB SPL\),80/);
        assert.doesNotMatch(coupler, /Medium level assumed/);
        const legacy = exportContext(null, { ...common, method: "perceptual", targetDbSPL: 75,
            runs: [], settingSDDB: 1, settingRangeDB: 2,
            ascendingMinusDescendingDB: 0, consistent: true }).generateCSV();
        assert.match(legacy, /MCL; legacy/);
        assert.match(legacy, /Reference tone level assumed \(dB SPL\),75/);
        assert.doesNotMatch(legacy, /Medium level assumed|direction:start/);
    });
test("CSV exports average band levels, coverage, and raw responses", () => {
    const context = exportContext({
        testDurationSeconds: 100, sampledSeconds: 50, sampleCount: 200,
        processingUncertain: true,
        bands: [500, 1000, 2000, 4000].map((frequency, index) => ({
            frequency, averageDbSPL: 30 + index, limit: [47, 44, 54, 59][index]
        }))
    });
    const csv = context.generateCSV();
    assert.match(csv, /Monitoring coverage \(%\),50\.0/);
    assert.match(csv, /Transducer,Supra-\/circumaural headphones \(recommended: Sennheiser HD 280 Pro\)/);
    assert.match(csv, /RETSPL 500\/1000\/2000\/4000 Hz \(dB SPL\),6\.8\/1\.4\/1\.9\/2\.2/);
    assert.match(csv, /500,30\.0,47/);
    assert.match(csv, /4000,33\.0,59/);
    assert.match(csv, /Microphone processing uncertain,Yes/);
    assert.match(csv, /not calibrated SPL/);
    assert.match(csv, /right,1000,20,yes/);
});

test("CSV reports missing or unused monitoring explicitly without fabricated averages", () => {
    for (const noise of [null, { sampleCount: 0 }]) {
        const csv = exportContext(noise).generateCSV();
        assert.match(csv, /Not available; no usable monitoring samples/);
        assert.doesNotMatch(csv, /NaN|Infinity/);
        assert.match(csv, /right,1000,20,yes/);
    }
});
