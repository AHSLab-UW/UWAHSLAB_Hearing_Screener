# UW AHSLAB Hearing Screener

A browser-based hearing screener from the University of Washington Auditory Human
Systems Laboratory (AHSLAB). The screener plays tones at several frequencies,
records trial-by-trial Yes/No responses, and estimates a Hearing Number and
frequency-specific thresholds using a PCA-informed psychometric model.

This tool is intended only for adults aged 18 or older. Participants under 18
cannot continue past the age-entry page; they should seek age-appropriate
hearing screening from a hearing care professional. Age must be entered in
whole years (18 to 120). Eligibility is also checked before tone playback and
model fitting. This age restriction alone does not establish WHO conformance.

## Run locally

This is a static HTML, CSS, and JavaScript project; it has no build step or
package installation. From the project root, start a local web server:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a browser and select **Start**. Allow audio
playback, use headphones in a quiet environment, and follow the on-screen
instructions. The screener asks for age and sex, then guides the participant
through the hearing screening and displays results.

On mobile phones, question choices and screening response buttons use the
available viewport with large touch targets, retaining the existing colors and
shapes. The main question and screening controls fit without scrolling at
standard text sizes. Expanded optional room-noise instructions and enlarged text
remain scrollable so that content is never clipped.

Questions, form labels, and multiple-choice option text use a shared readable
font size. Start and Next use the same navigation text size. The three
multiple-choice pages keep horizontal options on larger screens and
automatically stack them vertically on screens 600 CSS pixels wide or less.
Pages scroll vertically so all options remain accessible on phones.

## Optional ambient noise monitoring

Below the screening controls, expand the compact room-noise status bar to access
instructions and opt in to microphone monitoring. Read the displayed
sentence for eight seconds before starting the hearing screener. The app assumes
the time-averaged voice level is 62.5 dBA and uses the A-weighted microphone
spectrum as a rough reference. It then estimates unweighted octave-band SPL
at 500, 1000, 2000, and 4000 Hz. The bar is green when all four estimates are
at or below 40, 40, 47, and 57 dB SPL respectively, red when any exceeds its
limit, and grey when monitoring is off or not ready. Individual band results
are not displayed. These are the octave-band room noise limits in
[OSHA 29 CFR 1910.95 Appendix D](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.95AppD),
not one-third-octave limits.

A spoken sentence with an assumed level cannot establish traceable acoustic
calibration or a microphone's frequency response. Voice level, mouth-to-mic
distance, room acoustics, and microphone processing can substantially bias
these estimates. The indicator is advisory, does not pause testing, and
does not establish OSHA/WHO compliance or prove that a room is suitable for
low-level hearing screening. Keep the microphone position unchanged after
setting the reference and use headphones to reduce test-tone leakage.

Microphone access requires HTTPS or localhost and permission from the user.
Microphone audio is processed locally, without saving or uploading recordings.
Stop microphone, disable monitoring, hide the page, or leave the page to
release microphone access. A new voice reference is required to resume.
Permission or device failures are displayed without preventing the hearing
screener from running without monitoring.

The CSV includes each band's energy-average estimated noise level over usable
microphone samples collected between test Start and completion. It averages
linear sound energy before converting to dB, not the displayed smoothed dB
values. Calibration speech and monitoring outside the test are excluded.
Test duration, sampled audio duration, coverage, and microphone-processing
uncertainty are exported alongside the averages. Gaps, including calibration
or stopped monitoring, are not filled in; no usable samples yields "Not
available". The estimates can include participant speech or leaked test tones.

## PCA + psychometric model

The PCA mean and three-component loading matrix in [`js/pca.js`](js/pca.js)
were trained using a large NHANES database. They provide population-informed
bases for predicting the four-frequency threshold profile in each ear.
Rather than fitting those bases to the test's threshold-crossing summaries,
the application fits them to the original trial-by-trial stimuli and Yes/No
responses.

[`runPCA`](js/pca.js) reads the trial log, age, sex, and test mode from
`sessionStorage`. For each candidate set of three latent PCA scores, it
reconstructs the full 10-variable profile: age, sex, four right-ear
thresholds, and four left-ear thresholds. A logistic psychometric function
converts a reconstructed threshold and stimulus level into the probability of
a Yes response:

```text
P(Yes) = 1 / (1 + exp(-(level - threshold) / 5 dB))
```

The posterior over PCA scores is updated from all retained responses using
independent normal score priors centered on the participant's age and sex
projected through the corresponding trained PCA loadings. Because the trained
loading columns have unit length, the scores are in dB-like units, and each
prior SD must be the component's √eigenvalue, not 1. The current SDs
(`PCA_SCORE_SD = [24, 12, 10]`) are **provisional** estimates. They imply adult
threshold SDs of about 10–13 dB and should be replaced with
`sqrt(explained_variance_)` from the NHANES training run. In the trained
model, the age and sex loadings are very small (about 0.014 score units per
year), so the prior shifts by less than 1 dB HL across the adult age range.
In both-ears mode, a Yes response is modeled as hearing the tone in either ear:
`P(Yes) = 1 - (1 - Pleft)(1 - Pright)`.

Before the final fit, leave-one-out cross-validation (LOOCV) predicts each
trial from the other trials. If the probability of the observed response is
below 5%, that response is excluded from the final posterior fit. If no trial
passes the cutoff, the reported profile is based on the age/sex-informed PCA
prior alone and the results page states that no responses were used. The
original stimuli and responses are not changed or deleted; the CSV export
includes the complete raw trial log and per-trial LOOCV probabilities/
exclusion flags. Posterior expectations are computed numerically over a grid
of ±6 prior SDs in 0.25-SD steps. Exact LOOCV is computed by dividing each
trial's likelihood out of the full posterior, so the fit takes about one
second in a browser.

### Robustness validation

[`scripts/pcaRecoverySimulation.js`](scripts/pcaRecoverySimulation.js) drives
the real staircase in `js/playAudio.js` with simulated listeners. It covers
ages 25/45/65/80, both sexes, single-ear and both-ears modes, and seven
ground-truth profiles (flat 0/20/40/60, high-frequency, sloping, asymmetric).
It compares four estimates: the raw staircase (last Yes level), an unpooled
per-frequency logistic fit, the legacy unit-variance PCA prior, and the
current scaled PCA prior. Errors are measured against the true thresholds.
Each experiment level reuses the same random seeds. Two experiments were run:

1. **Calibration error:** a fixed, frequency-independent attenuation is
   applied to every stimulus in a test.
2. **Lapses:** on a proportion of trials, the listener answers Yes/No at random.

Single-ear mean absolute error (dB, 56 simulated tests per level):

| Attenuation | Raw staircase | Unpooled | Scaled PCA (current) |
|-------------|---------------|----------|----------------------|
| −20 dB | 10.4 | 18.0 | 20.3 |
| −10 dB | 5.1 | 10.1 | 12.0 |
| 0 dB | 8.7 | 5.8 | 5.4 |
| +10 dB | 17.7 | 10.6 | 7.5 |
| +20 dB | 27.3 | 20.3 | 15.4 |
| +30 dB | 36.6 | 30.1 | 23.3 |

| Lapse rate | Raw staircase | Unpooled | Scaled PCA (current) |
|------------|---------------|----------|----------------------|
| 0% | 8.7 | 5.8 | 5.4 |
| 5% | 10.4 | 7.0 | 5.5 |
| 10% | 11.5 | 8.2 | 5.7 |
| 20% | 14.9 | 11.2 | 6.7 |
| 30% | 17.7 | 13.3 | 7.3 |
| 50% | 22.7 | 18.6 | 11.0 |

Interpretation:

- **Lapses:** the PCA fit is clearly more robust than either baseline. Its
  error grows by only ~2 dB up to a 30% lapse rate, because LOOCV removes
  responses that contradict the cross-frequency pattern (5% of trials
  excluded at a 30% lapse rate), and because the covariance pools
  information across frequencies and ears.
- **Calibration:** the PCA fit gives only partial protection. The mean
  bias rises 0.88 dB per dB of attenuation (0.83 in both-ears mode),
  compared with ~0.95 for the baselines. The first trained component loads
  positively on all eight thresholds, so a uniform calibration offset looks
  exactly like a real flat change in hearing. No response-based model can
  separate the two without an external level reference. The small reduction
  comes from shrinkage toward the population prior, which also shrinks
  genuine losses. The legacy unit prior showed a slope of ~0, but only
  because it ignored the responses (17–19 dB error at every level). The raw
  staircase looks best at −10 dB only because its own ~+8 dB step bias
  happens to cancel the offset.

Both-ears mode can identify only the better ear. The simulation assumes the
model's own 5 dB psychometric slope; lapses are 50/50 guesses.

Run it with `node scripts/pcaRecoverySimulation.js [report.json] [repetitions] [calibration,lapse]`.

The results page reports a Hearing Number for each ear, calculated as the
arithmetic mean of reconstructed thresholds at 500, 1000, 2000, and 4000 Hz,
alongside those frequency-specific thresholds. The number is presented as a
wellness-oriented snapshot to help people understand hearing differences,
not as a medical diagnosis. It is a population-informed estimate, not a direct
equipment calibration or a guarantee of improved accuracy. Systematic errors
that align with learned population patterns may remain, and genuine atypical
profiles may also be smoothed.

## Project layout

- `index.html` — welcome page and starting point.
- `pages/` — survey, instructions, test, results, and follow-up pages.
- `js/playAudio.js` — tone playback, response collection, and raw thresholds.
- `js/pca.js` — trained PCA parameters and reconstruction functions.
- `js/results.js` — result display and CSV export.
- `css/style.css` — page styling.
- `images/` — logos and visual assets.

The application keeps answers and test results in browser `sessionStorage`.
They are used to move data between pages during a session and are cleared when
the session ends or the browser clears site data.
