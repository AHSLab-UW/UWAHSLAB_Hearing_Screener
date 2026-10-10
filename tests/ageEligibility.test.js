const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function loadScript(context, name) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", name), "utf8"), context);
}

function createContext(age, selectedSex = true) {
    const handlers = {};
    const alerts = [];
    const stored = new Map([["userAge", "40"]]);
    const context = vm.createContext({
        console,
        alert: message => alerts.push(message),
        window: { location: { href: "" } },
        sessionStorage: {
            getItem: key => stored.get(key) ?? null,
            setItem: (key, value) => stored.set(key, String(value)),
            removeItem: key => stored.delete(key)
        },
        document: {
            querySelector: selector => {
                if (selector === 'input[name="age"]') return { value: age };
                if (selector === 'input[name="userSex"]:checked') {
                    return selectedSex ? { value: "female" } : null;
                }
                return { addEventListener: (event, handler) => { handlers[selector] = handler; } };
            },
            getElementById: id => ({
                addEventListener: (event, handler) => { handlers[id] = handler; }
            })
        }
    });
    loadScript(context, "ageEligibility.js");
    return { context, handlers, alerts, stored };
}

test("adult eligibility rejects minors and invalid ages; accepts adult boundaries", () => {
    const { context } = createContext("");
    for (const age of [0, 1, 17, 17.9, 18.5, 121, NaN, Infinity]) {
        assert.equal(context.isEligibleAdultAge(age), false, String(age));
    }
    for (const age of [18, 40, 120]) {
        assert.equal(context.isEligibleAdultAge(age), true, String(age));
    }
});

test("survey blocks minors and invalid ages and clears stale eligibility", () => {
    for (const age of ["", "17", "17.9", "18.5", "121", "invalid"]) {
        const { context, handlers, alerts, stored } = createContext(age);
        loadScript(context, "surveyPage.js");
        handlers["#nextBttn"]();
        assert.equal(context.window.location.href, "");
        assert.equal(stored.has("userAge"), false);
        assert.equal(alerts.length, 1);
    }
});

test("survey permits adults only after sex selection", () => {
    for (const age of ["18", "120"]) {
        const { context, handlers, stored } = createContext(age);
        loadScript(context, "surveyPage.js");
        handlers["#nextBttn"]();
        assert.equal(context.window.location.href, "../pages/hearingDeviceLikert.html");
        assert.equal(stored.get("userAge"), age);
    }
    const { context, handlers, alerts } = createContext("18", false);
    loadScript(context, "surveyPage.js");
    handlers["#nextBttn"]();
    assert.equal(context.window.location.href, "");
    assert.match(alerts[0], /select your sex/);
});

test("PCA fitting rejects a stored underage participant", () => {
    const { context, stored } = createContext("17");
    stored.set("userAge", "17");
    stored.set("userSex", "female");
    stored.set("testmode", "single");
    loadScript(context, "pca.js");
    assert.throws(() => context.runPCA(), /requires an adult age/);
});

test("test start blocks direct access by an underage participant before audio resumes", async () => {
    const { context, handlers, alerts, stored } = createContext("17");
    stored.set("userAge", "17");
    context.AudioContext = class {
        createGain() { return { connect() {} }; }
        createStereoPanner() { return { connect() {} }; }
        resume() { throw new Error("Audio must not resume for an ineligible participant"); }
    };
    context.document.querySelectorAll = () => [];
    loadScript(context, "playAudio.js");
    await handlers["#enableMessage"]();
    assert.equal(context.window.location.href, "../pages/SurveyPage.html");
    assert.equal(stored.has("userAge"), false);
    assert.match(alerts[0], /adults aged 18/);
});
