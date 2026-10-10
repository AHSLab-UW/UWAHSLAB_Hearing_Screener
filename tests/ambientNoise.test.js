const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function loadContext(extra = {}) {
    const context = vm.createContext({ console, ...extra });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/ambientNoise.js"), "utf8"), context);
    return context;
}

test("A weighting is approximately unity at 1 kHz and attenuates low frequencies", () => {
    const context = loadContext();
    assert.ok(Math.abs(context.aWeightPower(1000) - 1) < 0.002);
    assert.ok(context.aWeightPower(100) < 0.02);
    assert.equal(context.aWeightPower(0), 0);
});

test("FFT bins are assigned to octave bands and normalized to waveform energy", () => {
    const context = loadContext();
    for (const [bandIndex, frequency] of [500, 1000, 2000, 4000].entries()) {
        const spectrum = new Float32Array(4096).fill(-Infinity);
        spectrum[frequency / 4] = -20;
        const waveform = new Float32Array([0.1, -0.1, 0.1, -0.1]);
        const result = context.measureNoiseSpectrum(spectrum, waveform, 32768, 8192);
        assert.ok(Math.abs(result.bandPowers[bandIndex] - 0.01) < 1e-8);
        result.bandPowers.forEach((power, index) => {
            if (index !== bandIndex) assert.equal(power, 0);
        });
        assert.ok(Math.abs(result.weightedPower - 0.01 * context.aWeightPower(frequency)) < 1e-8);
    }
});

test("levels use the 62.5 dBA voice reference and preserve specified warning boundaries", () => {
    const context = loadContext();
    for (const limit of [40, 47, 57]) {
        const powerAtLimit = 10 ** ((limit - 62.5) / 10);
        const level = context.estimatedBandLevels([powerAtLimit], 1)[0];
        assert.ok(Math.abs(level - limit) < 1e-10);
        assert.ok(context.estimatedBandLevels([powerAtLimit * 1.01], 1)[0] > limit);
        assert.ok(context.estimatedBandLevels([powerAtLimit / 1.01], 1)[0] < limit);
    }
    assert.equal(context.estimatedBandLevels([0], 1)[0], null);
    assert.throws(() => context.estimatedBandLevels([1], 0), /invalid/);
});

function mockUI(getUserMedia, extra = {}) {
    const elements = new Map();
    const stored = new Map([["userAge", "35"]]);
    const getElement = id => {
        if (!elements.has(id)) {
            elements.set(id, {
                checked: false, disabled: id !== "ambientToggle", textContent: "",
                classList: {
                    values: new Set(),
                    remove(name) { this.values.delete(name); },
                    toggle(name, enabled) {
                        if (enabled) this.values.add(name);
                        else this.values.delete(name);
                    }
                },
                addEventListener(event, handler) { this[event] = handler; }
            });
        }
        return elements.get(id);
    };
    const context = loadContext({
        console: { error() {} },
        document: { getElementById: getElement, addEventListener() {} },
        window: { isSecureContext: true, addEventListener() {} },
        navigator: { mediaDevices: { getUserMedia } },
        sessionStorage: {
            getItem: key => stored.get(key) ?? null,
            setItem: (key, value) => stored.set(key, String(value)),
            removeItem: key => stored.delete(key)
        },
        isEligibleAdultAge: age => age >= 18,
        clearInterval, setInterval,
        ...extra
    });
    return { context, getElement };
}

async function flush() {
    await new Promise(resolve => setImmediate(resolve));
}

test("monitoring is opt-in and denied microphone permission is explicitly reported", async () => {
    let requests = 0;
    const { getElement } = mockUI(async () => {
        requests++;
        throw new Error("Permission denied");
    });
    assert.equal(requests, 0);
    const toggle = getElement("ambientToggle");
    toggle.checked = true;
    toggle.change();
    getElement("ambientCalibrate").click();
    await flush();
    assert.equal(requests, 1);
    assert.match(getElement("ambientStatus").textContent, /Permission denied/);
    assert.equal(getElement("ambientCalibrate").disabled, false);
});

test("turning monitoring off while permission is pending releases the acquired microphone", async () => {
    let resolveRequest;
    let stopped = 0;
    const { getElement } = mockUI(() => new Promise(resolve => { resolveRequest = resolve; }));
    const toggle = getElement("ambientToggle");
    toggle.checked = true;
    toggle.change();
    getElement("ambientCalibrate").click();
    await flush();
    toggle.checked = false;
    toggle.change();
    resolveRequest({ getTracks: () => [{ stop() { stopped++; } }] });
    await flush();
    assert.equal(stopped, 1);
    assert.equal(getElement("ambientCalibrate").disabled, true);
    assert.match(getElement("ambientStatus").textContent, /off/);
});

test("voice referencing enables band warnings and stopping releases microphone resources", async () => {
    let tick;
    let time = 0;
    let stopped = 0;
    let closed = 0;
    let amplitude = 0.1;
    const track = {
        getSettings: () => ({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }),
        addEventListener() {},
        stop() { stopped++; }
    };
    const microphone = { getTracks: () => [track], getAudioTracks: () => [track] };
    const { context, getElement } = mockUI(async () => microphone, {
        performance: { now: () => time },
        setInterval: callback => { tick = callback; return 1; },
        clearInterval() {},
        AudioContext: class {
            state = "running";
            sampleRate = 32768;
            async resume() {}
            async close() { this.state = "closed"; closed++; }
            createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
            createAnalyser() {
                return {
                    frequencyBinCount: 4096,
                    getFloatFrequencyData(array) {
                        array.fill(-Infinity);
                        for (const bin of [125, 250, 500, 1000]) array[bin] = -20;
                    },
                    getFloatTimeDomainData(array) {
                        array.forEach((_, index) => { array[index] = index % 2 ? amplitude : -amplitude; });
                    }
                };
            }
        }
    });
    getElement("ambientToggle").checked = true;
    getElement("ambientToggle").change();
    getElement("ambientCalibrate").click();
    await flush();
    time = 8001;
    tick();
    context.window.ambientNoiseMonitor.beginTest();
    time += 250;
    tick();
    assert.match(getElement("ambientLabel").textContent, /above estimated limits/);
    assert.equal(getElement("ambientSummary").classList.values.has("noise-exceeded"), true);
    assert.equal(getElement("ambientSummary").classList.values.has("noise-quiet"), false);
    amplitude = 0.0001;
    for (let frame = 0; frame < 100; frame++) {
        time += 250;
        tick();
    }
    assert.match(getElement("ambientLabel").textContent, /below estimated limits/);
    assert.equal(getElement("ambientSummary").classList.values.has("noise-quiet"), true);
    assert.equal(getElement("ambientSummary").classList.values.has("noise-exceeded"), false);
    getElement("ambientStop").click();
    await flush();
    assert.equal(stopped, 1);
    assert.equal(closed, 1);
    assert.match(getElement("ambientLabel").textContent, /off or not ready/);
    assert.equal(getElement("ambientSummary").classList.values.has("noise-quiet"), false);
    time += 1000;
    context.window.ambientNoiseMonitor.endTest();
    const saved = JSON.parse(context.sessionStorage.getItem("ambientNoiseTestAverage"));
    assert.equal(saved.sampleCount, 101);
    assert.ok(saved.sampledSeconds < saved.testDurationSeconds);
    assert.ok(saved.bands.every(band => Number.isFinite(band.averageDbSPL)));
    context.window.ambientNoiseMonitor.beginTest();
    assert.equal(context.sessionStorage.getItem("ambientNoiseTestAverage"), null);
});

test("test-period averages use energy and duration, not arithmetic averages of decibels", () => {
    const context = loadContext();
    const average = context.createAmbientTestAverage(1000);
    average.addSample([1, 1, 1, 1], 1, 1000, 0.25, 0, false);
    average.addSample([1, 1, 1, 1], 1, 1250, 0.25, 0, false);
    average.addSample([100, 100, 100, 100], 1, 1750, 0.5, 0, true);
    const result = average.finish(3000);
    assert.equal(result.sampleCount, 2);
    assert.equal(result.sampledSeconds, 0.75);
    assert.equal(result.testDurationSeconds, 2);
    assert.equal(result.processingUncertain, true);
    assert.ok(Math.abs(result.bands[0].averageDbSPL -
        (62.5 + 10 * Math.log10((0.25 + 100 * 0.5) / 0.75))) < 1e-10);
    average.addSample([1000, 1000, 1000, 1000], 1, 3250, 0.25, 0, false);
    assert.equal(average.finish(3500).sampleCount, 2);
});

test("calibration and missing band signals do not count as usable test noise", () => {
    const context = loadContext();
    const average = context.createAmbientTestAverage(0);
    average.addSample([1, 1, 1, 1], 1, 8000, 0.25, 8000, false);
    average.addSample([0, 1, 1, 1], 1, 8250, 0.25, 8000, false);
    const result = average.finish(9000);
    assert.equal(result.sampleCount, 0);
    assert.equal(result.sampledSeconds, 0);
    assert.ok(result.bands.every(band => band.averageDbSPL === null));
});

test("compact monitor is collapsed and placed after the primary response controls", () => {
    const html = fs.readFileSync(path.join(__dirname, "../pages/TestingPage.html"), "utf8");
    assert.ok(html.indexOf('id ="no"') < html.indexOf('<details class="ambient-monitor">'));
    assert.ok(!html.includes('<details class="ambient-monitor" open'));
    assert.ok(!/id="ambient(?:500|1000|2000|4000)"/.test(html));
});

test("Start button stays in normal flow above the expandable noise settings", () => {
    const css = fs.readFileSync(path.join(__dirname, "../css/style.css"), "utf8");
    const html = fs.readFileSync(path.join(__dirname, "../pages/TestingPage.html"), "utf8");
    const startStyles = css.match(/\.startButtonBox\s*\{([^}]+)\}/);
    assert.ok(startStyles);
    assert.doesNotMatch(startStyles[1], /position\s*:\s*(fixed|absolute|sticky)/);
    assert.ok(html.indexOf('class="startButtonBox"') < html.indexOf('<details class="ambient-monitor">'));
});
