const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

function rule(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, "m"));
    assert.ok(match, `Missing style rule: ${selector}`);
    return match[1];
}

test("questions, labels, sex choices and option text share the participant font size", () => {
    assert.match(rule(":root"), /--participant-text-size:\s*1\.5rem/);
    for (const selector of ["h2", "label", ".radio-face", ".likertText", ".likert-item h4"]) {
        assert.match(rule(selector), /font-size:\s*var\(--participant-text-size[,)]/);
    }
});

test("front-page Start and Next share the navigation font size", () => {
    for (const selector of ["#startBttn", "#nextBttn", ".nextBttn"]) {
        assert.match(rule(selector), /font-size:\s*var\(--navigation-text-size\)/);
    }
});

test("phone layouts stack the same options that remain horizontal on larger screens", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 600px)"));
    assert.match(mobile, /\.likert-container\s*\{[^}]*flex-direction:\s*column/);
    assert.match(mobile, /\.likert-item\s*\{[^}]*flex:\s*none/);
    assert.match(rule("body"), /overflow-y:\s*auto/);
    for (const name of ["likertPage.html", "hearingDeviceLikert.html", "confidenceLevel.html"]) {
        const html = fs.readFileSync(path.join(root, "pages", name), "utf8");
        assert.match(html, /name="viewport" content="width=device-width, initial-scale=1\.0"/);
        assert.match(html, /class="likert-container"/);
        assert.match(html, /class="likert-item"/);
    }
});
