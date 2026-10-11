const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function exportContext(noise) {
    const stored = new Map([
        ["testmode", "both"],
        ["bothResponses", JSON.stringify([{ ear: "both", frequency: 1000, levelHL: 20, response: "yes" }])]
    ]);
    if (noise) stored.set("ambientNoiseTestAverage", JSON.stringify(noise));
    const context = vm.createContext({
        document: { addEventListener() {}, querySelector: () => ({ addEventListener() {} }) },
        window: {},
        sessionStorage: { getItem: key => stored.get(key) ?? null }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/results.js"), "utf8"), context);
    return context;
}

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
    assert.match(csv, /500,30\.0,47/);
    assert.match(csv, /4000,33\.0,59/);
    assert.match(csv, /Microphone processing uncertain,Yes/);
    assert.match(csv, /not calibrated SPL/);
    assert.match(csv, /both,1000,20,yes/);
});

test("CSV reports missing or unused monitoring explicitly without fabricated averages", () => {
    for (const noise of [null, { sampleCount: 0 }]) {
        const csv = exportContext(noise).generateCSV();
        assert.match(csv, /Not available; no usable monitoring samples/);
        assert.doesNotMatch(csv, /NaN|Infinity/);
        assert.match(csv, /both,1000,20,yes/);
    }
});
