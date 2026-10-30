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
    "mclCancel", "calibrationClear", "transducer-headphones", "transducer-earbuds"];

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
    constructor() {
        this.currentTime = 0;
        this.destination = {};
        FakeAudioContext.instances.push(this);
        this.tones = [];
        this.levels = [];
        this.gainEvents = [];
    }
    async resume() {}
    createOscillator() {
        const oscillator = {
            frequency: {},
            connect() {},
            start: (...args) => { oscillator.startArgs = args; this.tones.push(oscillator); },
            stop: (...args) => { oscillator.stopped = true; oscillator.stopArgs = args; }
        };
        return oscillator;
    }
    createGain() {
        return {
            gain: {
                setValueAtTime: (value, time) => this.gainEvents.push({ type: "set", value, time }),
                setTargetAtTime: (value, time, constant) => {
                    this.levels.push(value);
                    this.gainEvents.push({ type: "target", value, time, constant });
                },
                linearRampToValueAtTime: (value, time) =>
                    this.gainEvents.push({ type: "ramp", value, time })
            },
            connect() {}
        };
    }
}
FakeAudioContext.instances = [];

function setup({ storage = memoryStorage(), random = () => 0.5, now = new Date("2026-10-10T10:00:00Z") } = {}) {
    const elements = Object.fromEntries(ids.map(id => [id, element()]));
    elements["transducer-headphones"].value = "headphones";
    elements["transducer-earbuds"].value = "earbuds";
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
    for (const dbSPL of [0, 30, 80, 93.5, 110]) {
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
    assert.deepEqual(audio.tones[0].startArgs, []);
    assert.deepEqual(audio.gainEvents.map(event => event.type), ["set", "target"]);
    assert.equal(audio.tones[0].stopped, undefined);
    assert.ok(Math.abs(audio.levels.at(-1) - vm.runInContext("CALIBRATION_AMPLITUDE", context)) < 1e-15);
    assert.equal(elements.couplerSave.disabled, false);
    await click("couplerSave");
    assert.equal(audio.tones[0].stopped, true);
    assert.deepEqual(audio.tones[0].stopArgs, [0.05]);
    const record = JSON.parse(storage.map.get("levelCalibration"));
    assert.equal(record.method, "coupler");
    assert.equal(record.gainOffsetDB, 0);
    assert.equal(record.targetDbSPL, 80);
    assert.equal(record.schemaVersion, 2);
    assert.match(elements.levelCalibrationStatus.textContent, /Coupler calibration saved/);
    assert.equal(Date.parse(record.expiresAt) - Date.parse(record.completedAt), 4 * 3600 * 1000);
    assert.match(elements.levelCalibrationLabel.textContent, /coupler/);
    assert.ok(elements.levelCalibrationSummary.classes.has("calibration-set"));
});

test("perceptual calibration averages alternating Medium settings and retains only summaries", async () => {
    const { elements, storage, click } = setup();
    await click("mclStart");
    assert.match(elements.levelCalibrationStatus.textContent, /Normal-hearing reference listener/);
    assert.equal(elements.mclSofter.disabled, true);
    await click("mclVolumeSet");
    const audio = FakeAudioContext.instances[0];
    const offsetOf = () => 20 * Math.log10(audio.levels.at(-1) / (0.1 * 10 ** ((80 - 93.5) / 20)));
    const presses = [["mclLouder", 5], ["mclSofter", 7], ["mclLouder", 6], ["mclSofter", 8]];
    const starts = [];
    const settings = [];
    for (const [button, count] of presses) {
        starts.push(Math.round(offsetOf()));
        assert.match(elements.levelCalibrationStatus.textContent, /Medium \(neither soft nor loud\)/);
        for (let i = 0; i < count; i++) await click(button);
        settings.push(Math.round(offsetOf()));
        await click("mclComfortable");
    }
    const record = JSON.parse(storage.map.get("levelCalibration"));
    assert.equal(record.method, "perceptual");
    assert.equal(record.targetDbSPL, 80);
    assert.equal(record.loudnessLabel, "Medium");
    assert.equal(record.referenceListener, "normal-hearing");
    assert.equal(record.settingCount, 4);
    assert.equal(Object.hasOwn(record, "runs"), false);
    assert.equal(starts[0], -16);
    assert.ok(starts[1] > 0 && starts[2] < 0);
    assert.deepEqual(settings, starts.map((start, i) => start + (i % 2 ? -2 : 2) * presses[i][1]));
    assert.equal(record.gainOffsetDB, settings.reduce((a, b) => a + b) / 4);
    assert.equal(typeof record.ascendingMinusDescendingDB, "number");
    assert.equal(record.consistent, true);
    assert.match(elements.levelCalibrationLabel.textContent, /Medium assumed 80 dB SPL/);
    assert.match(elements.levelCalibrationStatus.textContent, /all screenings with this setup/);
    assert.equal(audio.tones[0].stopped, true);
    assert.ok(Math.abs(offsetOf()) > 50, "tone ramps to silence when finished");
    const laterScreening = setup({ storage, now: new Date("2026-10-10T11:00:00Z") });
    const reused = laterScreening.controller.beginTest();
    assert.equal(reused.targetDbSPL, 80);
    assert.equal(reused.gainOffsetDB, record.gainOffsetDB);
    assert.equal(reused.loudnessLabel, "Medium");
    assert.equal(Object.hasOwn(reused, "runs"), false);
    assert.equal(laterScreening.elements.mclStart.disabled, true);
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

test("old 75 dB SPL calibrations are not reused or relabeled as Medium", () => {
    for (const method of ["coupler", "perceptual"]) {
        const storage = memoryStorage([["levelCalibration", JSON.stringify({
            method, frequencyHz: 1000, targetDbSPL: 75, gainOffsetDB: -8,
            completedAt: "2026-10-10T10:00:00Z", expiresAt: "2026-10-10T14:00:00Z"
        })]]);
        const { context, elements } = setup({ storage });
        assert.equal(context.storedLevelCalibration(storage, new Date("2026-10-10T11:00:00Z")), null);
        assert.match(elements.levelCalibrationStatus.textContent, /must be repeated/);
    }
});

function screeningContext(local) {
    const handlers = {};
    const stored = new Map([["userAge", "45"], ["userSex", "female"], ["testmode", "single"]]);
    const levels = [];
    const gainEvents = [];
    const context = vm.createContext({
        console: { log() {} },
        alert() {},
        setTimeout() {},
        localStorage: local,
        AudioContext: class {
            constructor() { this.currentTime = 0; }
            createGain() {
                return {
                    connect() {},
                    gain: {
                        setValueAtTime(value, time) {
                            levels.push(value);
                            gainEvents.push({ type: "set", value, time });
                        },
                        linearRampToValueAtTime(value, time) {
                            levels.push(value);
                            gainEvents.push({ type: "ramp", value, time });
                        }
                    }
                };
            }
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
    return { context, handlers, stored, levels, gainEvents };
}

test("transducer switch selects RETSPLs and calibrations only apply to the transducer they were made with", async () => {
    const { elements, context, storage, click } = setup();
    assert.equal(context.selectedTransducer(storage), "headphones");
    assert.equal(elements["transducer-headphones"].checked, true);
    assert.deepEqual([500, 1000, 2000, 4000].map(f => context.retsplFor(f, "headphones")), [6.8, 1.4, 1.9, 2.2]);
    assert.deepEqual([500, 1000, 2000, 4000].map(f => context.retsplFor(f, "earbuds")), [9.5, 4.4, 0.0, 6.7]);
    await click("couplerPlay");
    assert.equal(elements["transducer-earbuds"].disabled, true, "switch is locked while calibrating");
    await click("couplerSave");
    assert.equal(JSON.parse(storage.map.get("levelCalibration")).transducer, "headphones");
    assert.match(elements.levelCalibrationLabel.textContent, /\(headphones\): coupler/);

    elements["transducer-earbuds"].checked = true;
    elements["transducer-earbuds"].handlers.change();
    assert.equal(storage.map.get("transducerType"), "earbuds");
    assert.match(elements.levelCalibrationLabel.textContent, /\(earbuds\): not set/);
    assert.match(elements.levelCalibrationStatus.textContent, /Calibrate again/);
    assert.equal(context.storedLevelCalibration(storage), null);

    elements["transducer-headphones"].checked = true;
    elements["transducer-headphones"].handlers.change();
    assert.ok(context.storedLevelCalibration(storage, new Date("2026-10-10T10:30:00Z")));
});

test("screening starts without calibration and records that it was not calibrated", async () => {
    const { context, handlers, stored } = screeningContext(memoryStorage());
    await handlers["#enableMessage"]();
    assert.equal(context.window.location.href, undefined);
    assert.equal(JSON.parse(stored.get("levelCalibrationUsed")).method, "none");
    assert.equal(stored.get("transducerUsed"), "headphones");
});

test("screening with earbuds selected uses the earbud RETSPLs", async () => {
    const local = memoryStorage([["transducerType", "earbuds"]]);
    const { context, handlers, stored, levels } = screeningContext(local);
    await handlers["#enableMessage"]();
    assert.equal(stored.get("transducerUsed"), "earbuds");
    context.playTestTone(4000, 30, 0, false);
    const expected = 0.1 * 10 ** ((30 + 6.7 - 93.5) / 20);
    assert.ok(Math.abs(Math.max(...levels) / expected - 1) < 1e-12);
});

test("screening applies the stored calibration offset to test tones", async () => {
    const local = memoryStorage();
    const record = { schemaVersion: 2, method: "perceptual", loudnessLabel: "Medium",
        frequencyHz: 1000, targetDbSPL: 80, gainOffsetDB: -8,
        completedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600e3).toISOString() };
    local.setItem("levelCalibration", JSON.stringify(record));
    const { context, handlers, stored, levels } = screeningContext(local);
    await handlers["#enableMessage"]();
    assert.equal(JSON.parse(stored.get("levelCalibrationUsed")).gainOffsetDB, -8);
    context.playTestTone(1000, 40, 0, false);
    const expected = 0.1 * 10 ** ((40 + 1.4 - 93.5 - 8) / 20);
    assert.ok(Math.abs(Math.max(...levels) / expected - 1) < 1e-12);
});

test("test tone uses three 200 ms pulses with 35 ms rise and fall ramps", async () => {
    const { context, gainEvents } = screeningContext(memoryStorage());
    context.playTestTone(1000, 40, 0, false);

    const expectedTypes = [
        "set", "ramp", "set", "ramp",
        "set", "ramp", "set", "ramp",
        "set", "ramp", "set", "ramp"
    ];
    const expectedTimes = [0, 0.035, 0.165, 0.2, 0.4, 0.435, 0.565, 0.6, 0.8, 0.835, 0.965, 1];
    assert.deepEqual(gainEvents.map(event => event.type), expectedTypes);
    gainEvents.forEach((event, index) => {
        assert.ok(Math.abs(event.time - 3 - expectedTimes[index]) < 1e-9);
    });
    const volume = 0.1 * 10 ** ((40 + 1.4 - 93.5) / 20);
    assert.ok(Math.abs(Math.max(...gainEvents.map(event => event.value)) / volume - 1) < 1e-12);
    assert.deepEqual(gainEvents.filter(event => event.type === "ramp" && event.value === 0).length, 3);
});

test("start page goes directly to the screening page; calibration is an opt-in panel there", () => {
    const source = fs.readFileSync(path.join(root, "js", "startpage.js"), "utf8");
    assert.equal(source.match(/TestingPage\.html/g).length, 2);
    assert.equal(fs.existsSync(path.join(root, "pages", "CalibrationPage.html")), false);
    const page = fs.readFileSync(path.join(root, "pages", "TestingPage.html"), "utf8");
    for (const id of ids) assert.match(page, new RegExp(`id="${id}"`));
    assert.ok(page.indexOf("perceptualCalibration.js") < page.indexOf("playAudio.js"));
});
