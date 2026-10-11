// Optional level calibration, done once per sitting and reused for later screenings.
// All test levels are relative to a 1 kHz reference tone generated at the digital level that
// nominally gives 75 dB SPL. Two opt-in methods tie that tone to an acoustic level:
//   coupler:    the operator adjusts the device volume until a coupler/sound level meter reads
//               75 dB SPL (gain offset 0).
//   perceptual: the participant sets the device volume roughly comfortable, then makes four
//               on-screen most-comfortable-level (MCL) settings, alternating ascending and
//               descending runs from randomized starting levels. The mean setting is assumed
//               to be 75 dB SPL, the approximate pure-tone MCL of normal-hearing adults
//               (Hawley et al., 2017; Al-Salim et al., 2010). Averaging ascending and
//               descending runs cancels the approach bias (Hochberg, 1975; Punch et al., 2004)
//               and reduces within-listener scatter. See README.
// Browsers cannot read or lock the device volume, so it must not be changed afterwards.
const CALIBRATION_FREQUENCY_HZ = 1000;
const CALIBRATION_TARGET_DB_SPL = 75;
// Device assumption without calibration (0.1 amplitude = 93.5 dB SPL); it sets the digital
// level of the reference tone and leaves headroom for louder test tones.
const LEGACY_REFERENCE_DB_SPL = 93.5;
const LEGACY_REFERENCE_AMPLITUDE = 0.1;
const CALIBRATION_AMPLITUDE =
    LEGACY_REFERENCE_AMPLITUDE * 10 ** ((CALIBRATION_TARGET_DB_SPL - LEGACY_REFERENCE_DB_SPL) / 20);
const LEVEL_CALIBRATION_KEY = "levelCalibration";
const LEVEL_CALIBRATION_USED_KEY = "levelCalibrationUsed";
const CALIBRATION_VALID_HOURS = 4;
const MCL_RUN_DIRECTIONS = ["ascending", "descending", "ascending", "descending"];
const MCL_STEP_DB = 2;
const MCL_START_DISTANCE_DB = [12, 20];
const MCL_OFFSET_LIMITS_DB = [-30, 20];
const MCL_CONSISTENCY_RANGE_DB = 12;

function defaultLocalStorage() {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}

// gainOffsetDB is the digital level (re the reference tone) assumed to give 75 dB SPL.
function splToAmplitude(dbSPL, gainOffsetDB = 0) {
    return CALIBRATION_AMPLITUDE * 10 ** ((dbSPL - CALIBRATION_TARGET_DB_SPL + gainOffsetDB) / 20);
}

function storedLevelCalibration(storage = defaultLocalStorage(), now = new Date()) {
    if (!storage) return null;
    try {
        const record = JSON.parse(storage.getItem(LEVEL_CALIBRATION_KEY) || "null");
        if (!record || !["coupler", "perceptual"].includes(record.method)) return null;
        if (!(Date.parse(record.expiresAt) > now.getTime())) return null;
        return record;
    } catch {
        return null;
    }
}

function baseRecord(method, now) {
    return {
        method,
        frequencyHz: CALIBRATION_FREQUENCY_HZ,
        targetDbSPL: CALIBRATION_TARGET_DB_SPL,
        completedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + CALIBRATION_VALID_HOURS * 3600 * 1000).toISOString()
    };
}

function createCouplerRecord(now = new Date()) {
    return { ...baseRecord("coupler", now), gainOffsetDB: 0 };
}

function createPerceptualRecord(runs, now = new Date()) {
    const settings = runs.map(run => run.settingDB);
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    const average = mean(settings);
    const sd = Math.sqrt(settings.reduce((sum, value) => sum + (value - average) ** 2, 0) / (settings.length - 1));
    const byDirection = direction => mean(runs.filter(run => run.direction === direction).map(run => run.settingDB));
    const round = value => Math.round(value * 10) / 10;
    const range = Math.max(...settings) - Math.min(...settings);
    return {
        ...baseRecord("perceptual", now),
        gainOffsetDB: round(average),
        runs,
        settingSDDB: round(sd),
        ascendingMinusDescendingDB: round(byDirection("ascending") - byDirection("descending")),
        settingRangeDB: round(range),
        consistent: range <= MCL_CONSISTENCY_RANGE_DB
    };
}

function describeCalibration(record) {
    if (!record) return "not set (optional)";
    const time = new Date(record.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (record.method === "coupler") return `coupler, ${CALIBRATION_TARGET_DB_SPL} dB SPL (set ${time})`;
    return `perceptual${record.consistent ? "" : ", variable"} (set ${time})`;
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
    }

    function refresh() {
        const record = storedLevelCalibration(storage, now());
        label.textContent = `Level calibration: ${describeCalibration(record)}`;
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
        buttons.couplerPlay.textContent = "Play coupler tone";
        refresh();
        status.textContent = message;
    }

    function startRun() {
        const direction = MCL_RUN_DIRECTIONS[runs.length];
        const [low, high] = MCL_START_DISTANCE_DB;
        // Randomized start levels keep the participant from counting button presses.
        const distance = MCL_STEP_DB * Math.round((low + random() * (high - low)) / MCL_STEP_DB);
        const center = runs.length ? runs.reduce((sum, run) => sum + run.settingDB, 0) / runs.length : 0;
        const [minimum, maximum] = MCL_OFFSET_LIMITS_DB;
        offsetDB = Math.min(maximum, Math.max(minimum, Math.round(center / MCL_STEP_DB) * MCL_STEP_DB + (direction === "ascending" ? -distance : distance)));
        runs.push({ direction, startDB: offsetDB, settingDB: null });
        setToneLevel();
        status.textContent = `Adjustment ${runs.length} of ${MCL_RUN_DIRECTIONS.length}: the tone now starts ` +
            `${direction === "ascending" ? "too soft. Select Louder" : "too loud. Select Softer"} until it is at your most comfortable level, ` +
            "then select Comfortable. You may go past it and come back.";
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
        storage?.setItem(LEVEL_CALIBRATION_KEY, JSON.stringify(createCouplerRecord(now())));
        finish(`Coupler calibration saved for ${CALIBRATION_VALID_HOURS} hours. Do not change the device volume.`);
    });

    buttons.mclStart.addEventListener("click", () => guarded(async () => {
        mode = "mclVolume";
        offsetDB = 0;
        runs = [];
        await startTone();
        setEnabled(["mclVolumeSet", "mclCancel"]);
        status.textContent = "Step 1: use the device volume buttons until the tone is roughly comfortable, then select Volume is set.";
    }));

    buttons.mclVolumeSet.addEventListener("click", () => {
        mode = "mclRun";
        setEnabled(["mclSofter", "mclLouder", "mclComfortable", "mclCancel"]);
        startRun();
    });

    function step(deltaDB) {
        const [minimum, maximum] = MCL_OFFSET_LIMITS_DB;
        const next = offsetDB + deltaDB;
        if (next < minimum || next > maximum) {
            status.textContent = `This is the ${deltaDB > 0 ? "loudest" : "softest"} setting available. ` +
                `Select Cancel, ${deltaDB > 0 ? "raise" : "lower"} the device volume, and start again.`;
            return;
        }
        offsetDB = next;
        setToneLevel();
    }
    buttons.mclSofter.addEventListener("click", () => step(-MCL_STEP_DB));
    buttons.mclLouder.addEventListener("click", () => step(MCL_STEP_DB));

    buttons.mclComfortable.addEventListener("click", () => {
        runs[runs.length - 1].settingDB = offsetDB;
        if (runs.length < MCL_RUN_DIRECTIONS.length) return startRun();
        const record = createPerceptualRecord(runs, now());
        storage?.setItem(LEVEL_CALIBRATION_KEY, JSON.stringify(record));
        finish(record.consistent
            ? `Perceptual calibration saved for ${CALIBRATION_VALID_HOURS} hours. Do not change the device volume.`
            : `Saved, but your settings varied by ${record.settingRangeDB} dB. Consider repeating the calibration.`);
    });

    buttons.mclCancel.addEventListener("click", () => finish("Calibration cancelled. The previous calibration, if any, is unchanged."));

    buttons.calibrationClear.addEventListener("click", () => {
        storage?.removeItem(LEVEL_CALIBRATION_KEY);
        finish("Calibration cleared.");
    });

    status.textContent = refresh()
        ? "A calibration from this sitting is active. Keep the same device, headphones and volume."
        : "No calibration is set. Choose one of the methods above, or start the screening without calibration.";

    return {
        // Called when the screening starts: stops any tone and freezes the calibration used.
        beginTest() {
            stopTone();
            mode = "locked";
            setEnabled([]);
            panel.open = false;
            status.textContent = "Calibration is locked during the screening.";
            return storedLevelCalibration(storage, now());
        }
    };
}

if (typeof document !== "undefined" && typeof document.getElementById === "function"
    && document.getElementById("levelCalibrationPanel")) {
    window.levelCalibration = initializeLevelCalibration();
}
