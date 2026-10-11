// OSHA-based octave-band MPANLs extended for the Sennheiser HD 280 Pro
// (Margolis, Saly & Wilson, 2022, J Am Acad Audiol 33(1):45-56, Table 1).
const AMBIENT_BANDS = [
    { frequency: 500, limit: 47 },
    { frequency: 1000, limit: 44 },
    { frequency: 2000, limit: 54 },
    { frequency: 4000, limit: 59 }
];
const VOICE_REFERENCE_DBA = 62.5;

function aWeightPower(frequency) {
    if (frequency <= 0) return 0;
    const f2 = frequency * frequency;
    const response = (12194 ** 2 * f2 * f2) /
        ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) *
        (f2 + 12194 ** 2));
    return response * response * 10 ** (2 / 10);
}

function measureNoiseSpectrum(spectrum, waveform, sampleRate, fftSize) {
    const binWidth = sampleRate / fftSize;
    const powers = Array.from(spectrum, db => Number.isFinite(db) ? 10 ** (db / 10) : 0);
    const spectralPower = powers.reduce((sum, power) => sum + power, 0);
    const waveformMean = waveform.reduce((sum, sample) => sum + sample, 0) / waveform.length;
    const rmsPower = waveform.reduce((sum, sample) => sum + (sample - waveformMean) ** 2, 0) /
        waveform.length;
    // Normalize the windowed FFT energy to the unwindowed time-domain power.
    const scale = spectralPower > 0 ? rmsPower / spectralPower : 0;
    const weightedPower = powers.reduce((sum, power, index) =>
        sum + power * aWeightPower(index * binWidth), 0) * scale;
    const bandPowers = AMBIENT_BANDS.map(({ frequency }) => {
        const lower = frequency / Math.SQRT2;
        const upper = frequency * Math.SQRT2;
        return powers.reduce((sum, power, index) =>
            sum + (index * binWidth >= lower && index * binWidth < upper ? power : 0), 0) * scale;
    });
    return {
        weightedPower,
        bandPowers,
        peak: waveform.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0)
    };
}

function estimatedBandLevels(bandPowers, referencePower) {
    if (!Number.isFinite(referencePower) || referencePower <= 0) {
        throw new Error("The voice reference is invalid. Please calibrate again.");
    }
    return bandPowers.map(power =>
        power > 0 ? VOICE_REFERENCE_DBA + 10 * Math.log10(power / referencePower) : null
    );
}

function createAmbientTestAverage(startTime) {
    let endTime = null;
    let lastSampleEnd = startTime;
    let sampledSeconds = 0;
    let sampleCount = 0;
    let processingUncertain = false;
    const energy = AMBIENT_BANDS.map(() => 0);
    return {
        addSample(bandPowers, referencePower, sampleEnd, windowSeconds, validSince, uncertain) {
            if (endTime !== null) return;
            const sampleStart = Math.max(startTime, lastSampleEnd, validSince, sampleEnd - windowSeconds * 1000);
            const seconds = (sampleEnd - sampleStart) / 1000;
            if (seconds <= 0 || bandPowers.some(power => !Number.isFinite(power) || power <= 0)) return;
            bandPowers.forEach((power, index) => {
                energy[index] += power / referencePower * seconds;
            });
            sampledSeconds += seconds;
            sampleCount++;
            processingUncertain ||= uncertain;
            lastSampleEnd = sampleEnd;
        },
        finish(time) {
            endTime = time;
            return {
                testDurationSeconds: Math.max(0, (endTime - startTime) / 1000),
                sampledSeconds,
                sampleCount,
                processingUncertain,
                bands: AMBIENT_BANDS.map(({ frequency, limit }, index) => ({
                    frequency,
                    limit,
                    averageDbSPL: sampledSeconds > 0
                        ? VOICE_REFERENCE_DBA + 10 * Math.log10(energy[index] / sampledSeconds)
                        : null
                }))
            };
        }
    };
}

function initializeAmbientNoise() {
    const toggle = document.getElementById("ambientToggle");
    const calibrateButton = document.getElementById("ambientCalibrate");
    const stopButton = document.getElementById("ambientStop");
    const status = document.getElementById("ambientStatus");
    const summary = document.getElementById("ambientSummary");
    const label = document.getElementById("ambientLabel");
    let stream = null;
    let context = null;
    let source = null;
    let analyser = null;
    let timer = null;
    let generation = 0;
    let calibration = null;
    let referencePower = null;
    let smoothedPowers = null;
    let lastStatus = "";
    let processingWarning = "";
    let testAverage = null;
    let validSince = null;

    window.ambientNoiseMonitor = {
        beginTest() {
            sessionStorage.removeItem("ambientNoiseTestAverage");
            testAverage = createAmbientTestAverage(performance.now());
        },
        endTest() {
            if (testAverage) {
                sessionStorage.setItem("ambientNoiseTestAverage",
                    JSON.stringify(testAverage.finish(performance.now())));
                testAverage = null;
            }
        }
    };

    function setStatus(message) {
        if (message !== lastStatus) {
            status.textContent = message;
            lastStatus = message;
        }
    }

    function resetDisplay() {
        updateIndicator("Room noise: off or not ready", false, false);
    }

    function updateIndicator(message, quiet, exceeded) {
        label.textContent = message;
        summary.classList.toggle("noise-quiet", quiet);
        summary.classList.toggle("noise-exceeded", exceeded);
    }

    async function stop(message) {
        generation++;
        clearInterval(timer);
        timer = null;
        calibration = null;
        referencePower = null;
        validSince = null;
        smoothedPowers = null;
        if (stream) stream.getTracks().forEach(track => track.stop());
        stream = null;
        if (source) source.disconnect();
        source = null;
        analyser = null;
        const previousContext = context;
        context = null;
        calibrateButton.disabled = !toggle.checked;
        stopButton.disabled = true;
        resetDisplay();
        setStatus(message);
        if (previousContext && previousContext.state !== "closed") {
            try {
                await previousContext.close();
            } catch (error) {
                console.error("Unable to close the ambient microphone audio context:", error);
                setStatus(`${message} Audio cleanup failed: ${error.message}`);
            }
        }
    }

    async function start() {
        if (!toggle.checked) return;
        if (!isEligibleAdultAge(Number(sessionStorage.getItem("userAge")))) {
            setStatus("Enter an eligible adult age before enabling microphone monitoring.");
            return;
        }
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            setStatus("Microphone access requires a supported browser on HTTPS or localhost. You can still use the hearing screener without monitoring.");
            return;
        }
        calibrateButton.disabled = true;
        const requestGeneration = generation + 1;
        await stop("Requesting microphone access...");
        if (requestGeneration !== generation || !toggle.checked) return;
        calibrateButton.disabled = true;
        stopButton.disabled = false;
        try {
            const acquiredStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                video: false
            });
            if (requestGeneration !== generation) {
                acquiredStream.getTracks().forEach(track => track.stop());
                return;
            }
            stream = acquiredStream;
            const track = stream.getAudioTracks()[0];
            const settings = track.getSettings();
            processingWarning = ["echoCancellation", "noiseSuppression", "autoGainControl"]
                .some(setting => settings[setting] !== false)
                ? " The browser may apply microphone processing; estimates can be unreliable." : "";
            track.addEventListener("ended", () => {
                if (stream === acquiredStream) void stop("Microphone disconnected. Recalibrate to restart monitoring.");
            });
            context = new AudioContext();
            await context.resume();
            if (requestGeneration !== generation) return;
            source = context.createMediaStreamSource(stream);
            analyser = context.createAnalyser();
            analyser.fftSize = 8192;
            analyser.smoothingTimeConstant = 0;
            source.connect(analyser);
            // Never connect the microphone to the speakers or headphones.
            const spectrum = new Float32Array(analyser.frequencyBinCount);
            const waveform = new Float32Array(analyser.fftSize);
            calibration = { end: performance.now() + 8000, power: 0, frames: 0, clipped: false };
            updateIndicator("Room noise: setting voice reference", false, false);
            setStatus("Read the sentence aloud now at your normal conversational volume for 8 seconds.");
            timer = setInterval(() => {
                if (context.state !== "running") {
                    void stop("Microphone monitoring was interrupted. Recalibrate to restart.");
                    return;
                }
                analyser.getFloatFrequencyData(spectrum);
                analyser.getFloatTimeDomainData(waveform);
                const measurement = measureNoiseSpectrum(spectrum, waveform, context.sampleRate, analyser.fftSize);
                if (calibration) {
                    calibration.power += measurement.weightedPower;
                    calibration.frames++;
                    calibration.clipped ||= measurement.peak >= 0.99;
                    if (performance.now() < calibration.end) return;
                    const averagePower = calibration.power / calibration.frames;
                    if (calibration.clipped || averagePower < 1e-10) {
                        void stop(calibration.clipped
                            ? "Voice reference clipped. Move farther from the microphone and try again."
                            : "No usable voice reference detected. Check the microphone and read the sentence again.");
                        return;
                    }
                    referencePower = averagePower;
                    validSince = performance.now();
                    calibration = null;
                    calibrateButton.disabled = false;
                    setStatus(`Voice reference set to an assumed 62.5 dBA. Stop speaking; monitoring estimated room noise.${processingWarning}`);
                    return;
                }
                if (testAverage) {
                    testAverage.addSample(measurement.bandPowers, referencePower,
                        performance.now(), analyser.fftSize / context.sampleRate,
                        validSince, processingWarning !== "");
                }
                smoothedPowers = measurement.bandPowers.map((power, index) =>
                    smoothedPowers ? 0.75 * smoothedPowers[index] + 0.25 * power : power);
                const levels = estimatedBandLevels(smoothedPowers, referencePower);
                const exceeded = AMBIENT_BANDS.filter(({ limit }, index) =>
                    levels[index] !== null && levels[index] > limit);
                const usable = levels.every(level => level !== null && Number.isFinite(level));
                updateIndicator(exceeded.length
                    ? "Room noise: above estimated limits"
                    : usable ? "Room noise: below estimated limits" : "Room noise: estimate unavailable",
                usable && exceeded.length === 0, exceeded.length > 0);
                setStatus(exceeded.length
                    ? `Estimated noise exceeds a reference limit. Find a quieter space.${processingWarning}`
                    : usable
                        ? `All four estimated bands are at or below the reference limits.${processingWarning}`
                        : `A usable estimate is not available in every band. Do not rely on the indicator.${processingWarning}`);
            }, 250);
        } catch (error) {
            if (requestGeneration !== generation) return;
            console.error("Ambient noise monitoring could not start:", error);
            await stop(`Microphone monitoring unavailable: ${error.message}. You can still use the hearing screener without monitoring.`);
        }
    }

    toggle.addEventListener("change", () => {
        if (toggle.checked) {
            calibrateButton.disabled = false;
            setStatus("Read the instructions, then select Read sentence & set reference. Microphone access is optional.");
        } else {
            void stop("Microphone monitoring is off.");
        }
    });
    calibrateButton.addEventListener("click", () => { void start(); });
    stopButton.addEventListener("click", () => { void stop("Microphone stopped. Set a new voice reference to resume."); });
    window.addEventListener("pagehide", () => { void stop("Microphone monitoring is off."); });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && !stopButton.disabled) void stop("Monitoring stopped while the page was hidden. Recalibrate to resume.");
    });
}

if (typeof document !== "undefined") initializeAmbientNoise();
