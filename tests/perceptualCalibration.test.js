const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const load = (context, file) =>
    vm.runInContext(fs.readFileSync(path.join(root, "js", file), "utf8"), context);
const ids = ["levelCalibrationPanel", "levelCalibrationSummary", "levelCalibrationLabel", "levelCalibrationStatus",
    "couplerPlay", "couplerSave", "mclStart", "mclVolumeSet", "mclSofter", "mclLouder", "mclComfortable",
    "mclCancel", "calibrationClear"];

function element() {
    const handlers = {};
    const classes = new Set();
    return {
        handlers, classes, disabled: false, textContent: "", open: true,
        addEventListener: (type, handler) => { handlers[type] = handler; },
        classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) }
    };
}

function memoryStorage(initial = []) {
    const map = new Map(initial);
    return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
}

class FakeAudioContext {
    constructor() { this.currentTime = 0; this.destination = {}; FakeAudioContext.instances.push(this); this.tones = []; this.levels = []; }
    async resume() {}
    createOscillator() {
        const oscillator = { frequency: {}, connect() {}, start: () => this.tones.push(oscillator), stop() { oscillator.stopped = true; } };
        return oscillator;
    }
    createGain() {
        return { gain: { setValueAtTime() {}, setTargetAtTime: value => this.levels.push(value) }, connect() {} };
    }
}
FakeAudioContext.instances = [];

function setup({ storage = memoryStorage(), random = () => 0.5, now = new Date("2026-10-10T10:00:00Z") } = {}) {
    const elements = Object.fromEntries(ids.map(id => [id, element()]));
    const context = vm.createContext({});
    load(context, "perceptualCalibration.js");
    FakeAudioContext.instances = [];
    const controller = context.initializeLevelCalibration({
        doc: { getElementById: id => elements[id] }, storage, AudioContextClass: FakeAudioContext, random, now: () => now
    });
    return { elements, context, controller, storage, click: async id => elements[id].handlers.click() };
}

test("uncalibrated level mapping equals the legacy device assumption and the offset shifts all levels", () => {
    const { context } = setup();
    for (const dbSPL of [0, 30, 75, 93.5, 110]) {
        const legacy = 0.1 * 10 ** ((dbSPL - 93.5) / 20);
        assert.ok(Math.abs(context.splToAmplitude(dbSPL) / legacy - 1) < 1e-12);
        assert.ok(Math.abs(context.splToAmplitude(dbSPL, -6) / legacy - 10 ** (-6 / 20)) < 1e-12);
    }
});

test("coupler calibration plays the reference tone and stores a zero-offset record for the sitting", async () => {
    const { elements, context, storage, click } = setup();
    assert.match(elements.levelCalibrationLabel.textContent, /not set/);
    assert.equal(elements.couplerSave.disabled, true);
    await click("couplerPlay");
    const audio = FakeAudioContext.instances[0];
    assert.equal(audio.tones[0].frequency.value, 1000);
    assert.ok(Math.abs(audio.levels.at(-1) - vm.runInContext("CALIBRATION_AMPLITUDE", context)) < 1e-15);
    assert.equal(elements.couplerSave.disabled, false);
    await click("couplerSave");
    assert.equal(audio.tones[0].stopped, true);
    const record = JSON.parse(storage.map.get("levelCalibration"));
    assert.equal(record.method, "coupler");
    assert.equal(record.gainOffsetDB, 0);
    assert.equal(record.targetDbSPL, 75);
    assert.equal(Date.parse(record.expiresAt) - Date.parse(record.completedAt), 4 * 3600 * 1000);
    assert.match(elements.levelCalibrationLabel.textContent, /coupler/);
    assert.ok(elements.levelCalibrationSummary.classes.has("calibration-set"));
});

test("perceptual calibration averages alternating ascending and descending MCL runs", async () => {
    const { elements, storage, click } = setup();
    await click("mclStart");
    assert.equal(elements.mclSofter.disabled, true);
    await click("mclVolumeSet");
    const audio = FakeAudioContext.instances[0];
    const offsetOf = () => 20 * Math.log10(audio.levels.at(-1) / (0.1 * 10 ** ((75 - 93.5) / 20)));
    const presses = [["mclLouder", 5], ["mclSofter", 7], ["mclLouder", 6], ["mclSofter", 8]];
    for (const [button, count] of presses) {
        for (let i = 0; i < count; i++) await click(button);
        await click("mclComfortable");
    }
    const record = JSON.parse(storage.map.get("levelCalibration"));
    assert.equal(record.method, "perceptual");
    assert.deepEqual(record.runs.map(run => run.direction), ["ascending", "descending", "ascending", "descending"]);
    assert.equal(record.runs[0].startDB, -16);
    assert.ok(record.runs[1].startDB > 0 && record.runs[2].startDB < 0);
    const settings = record.runs.map(run => run.settingDB);
    assert.deepEqual(settings, record.runs.map((run, i) => run.startDB + (i % 2 ? -2 : 2) * presses[i][1]));
    assert.equal(record.gainOffsetDB, settings.reduce((a, b) => a + b) / 4);
    assert.equal(typeof record.ascendingMinusDescendingDB, "number");
    assert.equal(record.consistent, true);
    assert.equal(audio.tones[0].stopped, true);
    assert.ok(Math.abs(offsetOf()) > 50, "tone ramps to silence when finished");
});

test("inconsistent perceptual settings are saved but flagged, and calibration can be cleared", async () => {
    const { elements, storage, click } = setup();
    await click("mclStart");
    await click("mclVolumeSet");
    for (const [button, count] of [["mclLouder", 1], ["mclSofter", 1], ["mclLouder", 14], ["mclSofter", 1]]) {
        for (let i = 0; i < count; i++) await click(button);
        await click("mclComfortable");
    }
    const record = JSON.parse(storage.map.get("levelCalibration"));
    assert.equal(record.consistent, false);
    assert.match(elements.levelCalibrationStatus.textContent, /Consider repeating/);
    assert.ok(elements.levelCalibrationSummary.classes.has("calibration-variable"));
    await click("calibrationClear");
    assert.equal(storage.map.has("levelCalibration"), false);
    assert.match(elements.levelCalibrationLabel.textContent, /not set/);
});

test("stored calibrations are reused within the sitting and expire after 4 hours", () => {
    const { context } = setup();
    const storage = memoryStorage();
    storage.setItem("levelCalibration", JSON.stringify(context.createCouplerRecord(new Date("2026-10-10T10:00:00Z"))));
    assert.ok(context.storedLevelCalibration(storage, new Date("2026-10-10T13:59:00Z")));
    assert.equal(context.storedLevelCalibration(storage, new Date("2026-10-10T14:01:00Z")), null);
    assert.equal(context.storedLevelCalibration(null), null);
});

function screeningContext(local) {
    const handlers = {};
    const stored = new Map([["userAge", "45"], ["userSex", "female"], ["testmode", "single"]]);
    const levels = [];
    const context = vm.createContext({
        console: { log() {} },
        alert() {},
        setTimeout() {},
        localStorage: local,
        AudioContext: class {
            constructor() { this.currentTime = 0; }
            createGain() { return { connect() {}, gain: { setValueAtTime: value => levels.push(value) } }; }
            createStereoPanner() { return { connect() {}, pan: { setValueAtTime() {} } }; }
            createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() {} }; }
            async resume() {}
        },
        sessionStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
        document: {
            querySelector: selector => ({ addEventListener: (type, handler) => { handlers[selector] = handler; }, style: {} }),
            querySelectorAll: () => []
        },
        window: { location: {} }
    });
    for (const file of ["ageEligibility.js", "perceptualCalibration.js", "playAudio.js"]) load(context, file);
    return { context, handlers, stored, levels };
}

test("screening starts without calibration and records that it was not calibrated", async () => {
    const { context, handlers, stored } = screeningContext(memoryStorage());
    await handlers["#enableMessage"]();
    assert.equal(context.window.location.href, undefined);
    assert.equal(JSON.parse(stored.get("levelCalibrationUsed")).method, "none");
});

test("screening applies the stored calibration offset to test tones", async () => {
    const local = memoryStorage();
    const record = { method: "perceptual", frequencyHz: 1000, targetDbSPL: 75, gainOffsetDB: -8,
        completedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600e3).toISOString() };
    local.setItem("levelCalibration", JSON.stringify(record));
    const { context, handlers, stored, levels } = screeningContext(local);
    await handlers["#enableMessage"]();
    assert.equal(JSON.parse(stored.get("levelCalibrationUsed")).gainOffsetDB, -8);
    context.playTestTone(1000, 40, 0, false);
    const expected = 0.1 * 10 ** ((40 + 1.4 - 93.5 - 8) / 20);
    assert.ok(Math.abs(levels.at(-1) / expected - 1) < 1e-12);
});

test("start page goes directly to the screening page; calibration is an opt-in panel there", () => {
    const source = fs.readFileSync(path.join(root, "js", "startpage.js"), "utf8");
    assert.equal(source.match(/TestingPage\.html/g).length, 2);
    assert.equal(fs.existsSync(path.join(root, "pages", "CalibrationPage.html")), false);
    const page = fs.readFileSync(path.join(root, "pages", "TestingPage.html"), "utf8");
    for (const id of ids) assert.match(page, new RegExp(`id="${id}"`));
    assert.ok(page.indexOf("perceptualCalibration.js") < page.indexOf("playAudio.js"));
});
