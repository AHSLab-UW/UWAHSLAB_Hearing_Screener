// Optional level calibration, done once per sitting and reused for later screenings.
// All test levels are relative to a 1 kHz reference tone generated at the digital level that
// nominally gives 80 dB SPL. Two opt-in methods tie that tone to an acoustic level:
//   coupler:    the operator adjusts the device volume until a coupler/sound level meter reads
//               80 dB SPL (gain offset 0).
//   perceptual: a normal-hearing reference listener makes four "Medium" settings, alternating
//               ascending and descending runs. Diotic Medium is assigned 75 dB SPL per ear
//               (80 dB monaural anchor minus 5 dB binaural gain) and reused for the sitting.
//               See Schlittenlacher et al. (2014), doi:10.3758/s13414-014-0651-1, and README
//               and uncertainty. Only summary results, not individual tracks, are retained.
// Browsers cannot read or lock the device volume, so it must not be changed afterwards.
// Transducer categories and their RETSPLs (dB SPL at 0 dB HL), used for dB HL -> dB SPL.
const TRANSDUCERS = {
    headphones: {
        label: "Supra-/circumaural headphones",
        shortLabel: "headphones",
        recommended: "Sennheiser HD 280 Pro",
        // HD 280 Pro, IEC 60318 coupler with flat-plate adapter (Smull, Madsen & Margolis, 2019).
        retspl: { 500: 6.8, 1000: 1.4, 2000: 1.9, 4000: 2.2 },
        retsplSource: "Smull, Madsen & Margolis (2019), Sennheiser HD 280 Pro"
    },
    earbuds: {
        label: "Bluetooth earbuds",
        shortLabel: "earbuds",
        recommended: "Apple AirPods",
        // Measured for wired Apple EarPods MB770G (Ho, Li & Young, 2017); applied to AirPods as an
        // approximation because no AirPods RETSPLs are published.
        retspl: { 500: 9.5, 1000: 4.4, 2000: 0.0, 4000: 6.7 },
        retsplSource: "Ho, Li & Young (2017), Apple EarPods"
    }
};
const DEFAULT_TRANSDUCER = "headphones";
const TRANSDUCER_KEY = "transducerType";
const CALIBRATION_FREQUENCY_HZ = 1000;
const CALIBRATION_TARGET_DB_SPL = 80;
const MEDIUM_MONAURAL_DB_SPL = 80;
const MEDIUM_BINAURAL_SUMMATION_DB = 5;
const MEDIUM_DIOTIC_DB_SPL = MEDIUM_MONAURAL_DB_SPL - MEDIUM_BINAURAL_SUMMATION_DB;
const CALIBRATION_SCHEMA_VERSION = 3;
// Device assumption without calibration (0.1 amplitude = 93.5 dB SPL); it sets the digital
// level of the reference tone and leaves headroom for louder test tones.
const LEGACY_REFERENCE_DB_SPL = 93.5;
const LEGACY_REFERENCE_AMPLITUDE = 0.1;
const CALIBRATION_AMPLITUDE =
    LEGACY_REFERENCE_AMPLITUDE * 10 ** ((CALIBRATION_TARGET_DB_SPL - LEGACY_REFERENCE_DB_SPL) / 20);
const LEVEL_CALIBRATION_KEY = "levelCalibration";
const LEVEL_CALIBRATION_USED_KEY = "levelCalibrationUsed";
const CALIBRATION_VALID_HOURS = 4;
const MEDIUM_RUN_DIRECTIONS = ["ascending", "descending", "ascending", "descending"];
const MEDIUM_STEP_DB = 2;
const MEDIUM_START_DISTANCE_DB = [12, 20];
const MEDIUM_OFFSET_LIMITS_DB = [-30, 20];
const MEDIUM_CONSISTENCY_RANGE_DB = 12;

function defaultLocalStorage() {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}

function selectedTransducer(storage = defaultLocalStorage()) {
    try {
        const value = storage?.getItem(TRANSDUCER_KEY);
        return Object.hasOwn(TRANSDUCERS, value) ? value : DEFAULT_TRANSDUCER;
    } catch {
        return DEFAULT_TRANSDUCER;
    }
}

function retsplFor(frequency, transducer = DEFAULT_TRANSDUCER) {
    return (TRANSDUCERS[transducer] || TRANSDUCERS[DEFAULT_TRANSDUCER]).retspl[frequency];
}

// gainOffsetDB is the digital level (re the reference tone) assumed to give 80 dB SPL.
function splToAmplitude(dbSPL, gainOffsetDB = 0) {
    return CALIBRATION_AMPLITUDE * 10 ** ((dbSPL - CALIBRATION_TARGET_DB_SPL + gainOffsetDB) / 20);
}

// A calibration is valid only for the transducer it was made with.
function storedLevelCalibration(storage = defaultLocalStorage(), now = new Date(), transducer = selectedTransducer(storage)) {
    if (!storage) return null;
    try {
        const record = JSON.parse(storage.getItem(LEVEL_CALIBRATION_KEY) || "null");
        if (!record || !["coupler", "perceptual"].includes(record.method)) return null;
        if (record.schemaVersion !== CALIBRATION_SCHEMA_VERSION ||
            record.targetDbSPL !== (record.method === "perceptual" ? MEDIUM_DIOTIC_DB_SPL : CALIBRATION_TARGET_DB_SPL) ||
            record.frequencyHz !== CALIBRATION_FREQUENCY_HZ ||
            !Number.isFinite(record.gainOffsetDB)) return null;
        if (!(Date.parse(record.expiresAt) > now.getTime())) return null;
        if ((record.transducer || DEFAULT_TRANSDUCER) !== transducer) return null;
        return record;
    } catch {
        return null;
    }
}

function baseRecord(method, now, transducer) {
    return {
        schemaVersion: CALIBRATION_SCHEMA_VERSION,
        method,
        transducer,
        frequencyHz: CALIBRATION_FREQUENCY_HZ,
        targetDbSPL: CALIBRATION_TARGET_DB_SPL,
        completedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + CALIBRATION_VALID_HOURS * 3600 * 1000).toISOString()
    };
}

function createCouplerRecord(now = new Date(), transducer = DEFAULT_TRANSDUCER) {
    return { ...baseRecord("coupler", now, transducer), gainOffsetDB: 0 };
}

function createPerceptualRecord(runs, now = new Date(), transducer = DEFAULT_TRANSDUCER) {
    const settings = runs.map(run => run.settingDB);
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    const average = mean(settings);
    const sd = Math.sqrt(settings.reduce((sum, value) => sum + (value - average) ** 2, 0) / (settings.length - 1));
    const byDirection = direction => mean(runs.filter(run => run.direction === direction).map(run => run.settingDB));
    const round = value => Math.round(value * 10) / 10;
    const range = Math.max(...settings) - Math.min(...settings);
    return {
        ...baseRecord("perceptual", now, transducer),
        targetDbSPL: MEDIUM_DIOTIC_DB_SPL,
        loudnessLabel: "Medium",
        presentation: "diotic",
        monauralMediumDbSPL: MEDIUM_MONAURAL_DB_SPL,
        binauralSummationDB: MEDIUM_BINAURAL_SUMMATION_DB,
        referenceListener: "normal-hearing",
        settingCount: settings.length,
        meanSettingOffsetDB: round(average),
        // The digital reference remains nominally 80 dB SPL, not the 75 dB diotic anchor.
        gainOffsetDB: round(average + CALIBRATION_TARGET_DB_SPL - MEDIUM_DIOTIC_DB_SPL),
        settingSDDB: round(sd),
        ascendingMinusDescendingDB: round(byDirection("ascending") - byDirection("descending")),
        settingRangeDB: round(range),
        consistent: range <= MEDIUM_CONSISTENCY_RANGE_DB
    };
}

function describeCalibration(record) {
    if (!record) return "not set (optional)";
    const time = new Date(record.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (record.method === "coupler") return `coupler, ${record.targetDbSPL} dB SPL (set ${time})`;
    return `diotic Medium assumed ${record.targetDbSPL} dB SPL per ear${record.consistent ? "" : ", variable"} (set ${time})`;
}

function initializeLevelCalibration({
    doc = document,
    storage = defaultLocalStorage(),
    AudioContextClass = window.AudioContext || window.webkitAudioContext,
    random = Math.random,
    now = () => new Date()
} = {}) {
    const $ = id => doc.getElementById(id);
    const panel = $("levelCalibrationPanel");
    const summary = $("levelCalibrationSummary");
    const label = $("levelCalibrationLabel");
    const status = $("levelCalibrationStatus");
    const transducerInputs = Object.keys(TRANSDUCERS).map(key => $(`transducer-${key}`));
    const buttons = {
        couplerPlay: $("couplerPlay"), couplerSave: $("couplerSave"),
        mclStart: $("mclStart"), mclVolumeSet: $("mclVolumeSet"),
        mclSofter: $("mclSofter"), mclLouder: $("mclLouder"), mclComfortable: $("mclComfortable"),
        mclCancel: $("mclCancel"), calibrationClear: $("calibrationClear")
    };
    let audioContext = null;
    let oscillator = null;
    let gain = null;
    let mode = "idle"; // idle | coupler | mclVolume | mclRun | locked
    let offsetDB = 0;
    let runs = [];

    function setEnabled(enabled) {
        for (const [name, button] of Object.entries(buttons)) button.disabled = !enabled.includes(name);
        for (const input of transducerInputs) input.disabled = mode !== "idle";
    }

    function refresh() {
        const transducer = selectedTransducer(storage);
        for (const input of transducerInputs) input.checked = input.value === transducer;
        const record = storedLevelCalibration(storage, now(), transducer);
        label.textContent = `Level calibration (${TRANSDUCERS[transducer].shortLabel}): ${describeCalibration(record)}`;
        summary.classList.toggle("calibration-set", Boolean(record) && record.consistent !== false);
        summary.classList.toggle("calibration-variable", Boolean(record) && record.consistent === false);
        if (mode === "idle") setEnabled(record ? ["couplerPlay", "mclStart", "calibrationClear"] : ["couplerPlay", "mclStart"]);
        return record;
    }

    async function startTone() {
        audioContext ||= new AudioContextClass();
        await audioContext.resume();
        if (oscillator) return;
        oscillator = audioContext.createOscillator();
        oscillator.frequency.value = CALIBRATION_FREQUENCY_HZ;
        gain = audioContext.createGain();
        gain.gain.setValueAtTime(0, audioContext.currentTime);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        setToneLevel();
    }

    function setToneLevel() {
        if (gain) gain.gain.setTargetAtTime(splToAmplitude(CALIBRATION_TARGET_DB_SPL, offsetDB), audioContext.currentTime, 0.02);
    }

    function stopTone() {
        if (!oscillator) return;
        gain.gain.setTargetAtTime(0, audioContext.currentTime, 0.01);
        oscillator.stop(audioContext.currentTime + 0.05);
        oscillator = null;
        gain = null;
    }

    function finish(message) {
        stopTone();
        mode = "idle";
        offsetDB = 0;
        runs = [];
        buttons.couplerPlay.textContent = "Play coupler tone";
        refresh();
        status.textContent = message;
    }

    function startRun() {
        const direction = MEDIUM_RUN_DIRECTIONS[runs.length];
        const [low, high] = MEDIUM_START_DISTANCE_DB;
        // Randomized start levels keep the participant from counting button presses.
        const distance = MEDIUM_STEP_DB * Math.round((low + random() * (high - low)) / MEDIUM_STEP_DB);
        const center = runs.length ? runs.reduce((sum, run) => sum + run.settingDB, 0) / runs.length : 0;
        const [minimum, maximum] = MEDIUM_OFFSET_LIMITS_DB;
        offsetDB = Math.min(maximum, Math.max(minimum, Math.round(center / MEDIUM_STEP_DB) * MEDIUM_STEP_DB + (direction === "ascending" ? -distance : distance)));
        runs.push({ direction, startDB: offsetDB, settingDB: null });
        setToneLevel();
        status.textContent = `Adjustment ${runs.length} of ${MEDIUM_RUN_DIRECTIONS.length}: the tone starts ` +
            `${direction === "ascending" ? "softer. Select Louder" : "louder. Select Softer"} until its loudness is Medium (neither soft nor loud), ` +
            "then select Medium. You may go past it and come back. Cancel if the tone is uncomfortable.";
    }

    async function guarded(action) {
        try {
            await action();
        } catch (error) {
            finish(`The tone could not be played: ${error.message}`);
        }
    }

    buttons.couplerPlay.addEventListener("click", () => guarded(async () => {
        if (mode === "coupler") return finish("Coupler tone stopped. Calibration was not changed.");
        mode = "coupler";
        offsetDB = 0;
        await startTone();
        buttons.couplerPlay.textContent = "Stop coupler tone";
        setEnabled(["couplerPlay", "couplerSave"]);
        status.textContent = `Adjust the device volume until the meter reads ${CALIBRATION_TARGET_DB_SPL} dB SPL, then select Save.`;
    }));

    buttons.couplerSave.addEventListener("click", () => {
        storage?.setItem(LEVEL_CALIBRATION_KEY, JSON.stringify(createCouplerRecord(now(), selectedTransducer(storage))));
        finish(`Coupler calibration saved for ${CALIBRATION_VALID_HOURS} hours. Do not change the device volume.`);
    });

    buttons.mclStart.addEventListener("click", () => guarded(async () => {
        mode = "mclVolume";
        offsetDB = 0;
        runs = [];
        await startTone();
        setEnabled(["mclVolumeSet", "mclCancel"]);
        status.textContent = "Normal-hearing reference listener: set the device volume until the tone has roughly Medium loudness (neither soft nor loud), then select Volume is set.";
    }));

    buttons.mclVolumeSet.addEventListener("click", () => {
        mode = "mclRun";
        setEnabled(["mclSofter", "mclLouder", "mclComfortable", "mclCancel"]);
        startRun();
    });

    function step(deltaDB) {
        const [minimum, maximum] = MEDIUM_OFFSET_LIMITS_DB;
        const next = offsetDB + deltaDB;
        if (next < minimum || next > maximum) {
            status.textContent = `This is the ${deltaDB > 0 ? "loudest" : "softest"} setting available. ` +
                `Select Cancel, ${deltaDB > 0 ? "raise" : "lower"} the device volume, and start again.`;
            return;
        }
        offsetDB = next;
        setToneLevel();
    }
    buttons.mclSofter.addEventListener("click", () => step(-MEDIUM_STEP_DB));
    buttons.mclLouder.addEventListener("click", () => step(MEDIUM_STEP_DB));

    buttons.mclComfortable.addEventListener("click", () => {
        runs[runs.length - 1].settingDB = offsetDB;
        if (runs.length < MEDIUM_RUN_DIRECTIONS.length) return startRun();
        const record = createPerceptualRecord(runs, now(), selectedTransducer(storage));
        storage?.setItem(LEVEL_CALIBRATION_KEY, JSON.stringify(record));
        finish(record.consistent
            ? `Diotic Medium is assumed to be ${record.targetDbSPL} dB SPL per ear (5 dB binaural correction). Calibration saved for ${CALIBRATION_VALID_HOURS} hours for all screenings with this setup. Do not change the device volume.`
            : `Saved, but your settings varied by ${record.settingRangeDB} dB. Consider repeating the calibration.`);
    });

    buttons.mclCancel.addEventListener("click", () => finish("Calibration cancelled. The previous calibration, if any, is unchanged."));

    buttons.calibrationClear.addEventListener("click", () => {
        storage?.removeItem(LEVEL_CALIBRATION_KEY);
        finish("Calibration cleared.");
    });

    for (const input of transducerInputs) {
        input.addEventListener("change", () => {
            if (!input.checked) return;
            storage?.setItem(TRANSDUCER_KEY, input.value);
            const record = refresh();
            status.textContent = `${TRANSDUCERS[input.value].label} selected (${TRANSDUCERS[input.value].recommended} recommended). ` +
                (record ? "A calibration for this transducer is active." : "Calibrate again with this transducer.");
        });
    }

    status.textContent = refresh()
        ? "A calibration from this sitting is active. Keep the same device, headphones and volume."
        : "No current calibration is set. Previous calibration versions must be repeated for the diotic Medium correction. Choose a method above, or screen without calibration.";

    return {
        // Called when the screening starts: stops any tone and freezes the calibration used.
        beginTest() {
            stopTone();
            mode = "locked";
            setEnabled([]);
            for (const input of transducerInputs) input.disabled = true;
            panel.open = false;
            status.textContent = "Calibration is locked during the screening.";
            return storedLevelCalibration(storage, now());
        },
        transducer: () => selectedTransducer(storage)
    };
}

if (typeof document !== "undefined" && typeof document.getElementById === "function"
    && document.getElementById("levelCalibrationPanel")) {
    window.levelCalibration = initializeLevelCalibration();
}
