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

## Recommended headphones and level calibration

The recommended headphones are the **Sennheiser HD 280 Pro** (closed-back,
circumaural). Tone levels are specified in dB HL and converted to dB SPL with
the HD 280 Pro reference equivalent threshold sound pressure levels (RETSPLs)
reported by Smull, Madsen, and Margolis ([2019](#references)). These values were
measured in an IEC 60318 coupler with a flat-plate adapter.

| Frequency (Hz) | HD 280 Pro RETSPL (dB SPL at 0 dB HL) |
|----------------|---------------------------------------|
| 500 | 6.8 |
| 1000 | 1.4 |
| 2000 | 1.9 |
| 4000 | 2.2 |

The values are stored by frequency in `RETSPL_HD280_PRO` in
[`js/playAudio.js`](js/playAudio.js) (`dB SPL = dB HL + RETSPL`). Other
headphones would need their own RETSPLs. Browsers cannot read or lock the
device volume, so the digital-to-acoustic level is set by an optional level
calibration (below).

### Optional level calibration

The screening page has a collapsible **Level calibration** bar next to the
room-noise bar. Calibration is opt-in and is meant to be done once per
sitting. The result is stored in the browser's `localStorage` for 4 hours
and reused by later screenings with the same device, headphones, and volume
setting. **Clear calibration** removes it. All test levels are relative to a
1 kHz reference tone generated at the digital level that would be 75 dB SPL
under the uncalibrated device assumption (0.1 amplitude = 93.5 dB SPL). The
code is in [`js/perceptualCalibration.js`](js/perceptualCalibration.js).

1. **Coupler / sound level meter.** With an HD 280 Pro earcup on a coupler
   (flat-plate adapter), the operator plays the continuous reference tone and
   adjusts the device volume until the meter reads 75 dB SPL, then saves.
   Accuracy is then limited by the meter and the device's volume step size.
2. **Perceptual (no meter).** The participant first uses the device volume to
   make the tone roughly comfortable. They then make four on-screen
   most-comfortable-level (MCL) settings with **Softer**/**Louder** (2 dB
   steps). The runs alternate ascending (starting too soft) and descending
   (starting too loud), with starting points randomized 12–20 dB from the
   running estimate so that button presses cannot be counted. The mean
   setting becomes a digital gain offset, and the app assumes that this level
   is the participant's MCL of 75 dB SPL. Averaging ascending and descending
   runs cancels the approach bias. Averaging four settings reduces
   within-listener scatter (Hochberg, [1975](#references); Punch et al.,
   [2004](#references)). If the settings span more than 12 dB, the
   calibration is saved but flagged (amber indicator) and a repeat is
   suggested. The settings can range from −30 to +20 dB around the reference;
   at a limit, the participant is asked to adjust the device volume and
   start again.

Without calibration, the screening still runs using the unverified device
assumption. When the screening starts, the calibration in effect is frozen
for that test and the panel is locked. The CSV export reports the method,
the gain offset, and, for perceptual calibration, each run's direction,
starting level, and setting, plus the setting SD and the ascending-minus-
descending difference. A test without calibration is reported as not
calibrated.

The 75 dB SPL anchor approximates the pure-tone MCL of adults with normal
hearing. "Comfortable" warble tones averaged 70–79 dB HL across 500–4000 Hz
in Hawley et al. ([2017](#references)). The "medium" loudness category at
1 kHz was about 81–85 dB SPL for listeners with near-normal thresholds in
Al-Salim et al. ([2010](#references)).

**Expected error of perceptual calibration.** The per-test offset is
e = MCL(participant) − 75 dB SPL. Every stimulus is e dB louder than intended, so the reported thresholds
are about e dB too low. The literature suggests this offset is large:

| Source | Finding | Implication |
|--------|---------|-------------|
| Hawley et al. (2017) | "Comfortable" contour category, normal-hearing adults: between-subject SD 7–14 dB, within-subject SD 4.5–12 dB | Random offset of ~7–10 dB SD |
| Al-Salim et al. (2010) | Loudness-scaling test–retest difference SD 6.6–7.8 dB at 1–4 kHz | ~5 dB SD from retest alone |
| Dirks & Kamm (1976) | Normal-hearing MCL range is 10–20 dB wide | Any point in the range is "comfortable" |
| Punch et al. (2004); Hochberg (1975); Berger et al. (1980) | Instructions and ascending vs descending approach shift MCL by ~5–10 dB; pure-tone MCL reliability is poor | Procedure adds bias and variance |
| Kamm et al. (1978); Al-Salim et al. (2010) | MCL is nearly constant in SPL for mild loss and rises with greater loss (~0.15–0.2 dB per dB HL from 0–50 dB HL, from Al-Salim Table 2) | Hearing loss is partly under-reported |

For a single device-volume setting, the best estimate is a random offset of
about **8–10 dB SD**, plus an under-estimate of roughly 0.2 dB per dB of
loss above ~20 dB HL. The four-run procedure removes the approach bias and
roughly halves the within-listener part (~5–6 dB SD for one setting). The
between-listener differences in MCL (~7 dB SD) remain, so the expected
offset SD is about **7–8 dB**. For comparison, threshold-based
biological calibration of home audiometry had a calibration-error SD of
6.2 dB (Masalski & Kręcicki, [2013](#references)) and an overall SD of
8.3 dB (Masalski et al., [2018](#references)). Perceptual calibration is
therefore a coarse, roughly ±15 dB (95%) calibration, not an acoustic
calibration. Use the coupler method whenever a meter is available.

**Can the PCA fit correct it?** Only slightly. An MCL offset is uniform
across frequencies and ears, so it looks the same as a real flat change in
hearing (see the calibration and MCL experiments under
[Robustness validation](#robustness-validation)). The fit removes 12–17% of
a uniform offset, and it does so by pulling all results toward the
population mean, including genuine losses. With an 8 dB offset SD, the
single-ear error is 8.8 dB with the PCA fit, 8.8 dB with the unpooled fit,
and 9.5 dB with the raw staircase, versus 5.4 dB with perfect calibration.
Adding the offset as a latent variable with an MCL prior would at best
remove an estimated 10–25% more, in exchange for the same shrinkage of real
losses. External level information would be needed to do much better, for
example a sound-level-meter calibration of the device and headphone or
biological calibration against a listener with known thresholds.

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
at or below 47, 44, 54, and 59 dB SPL respectively, red when any exceeds its
limit, and grey when monitoring is off or not ready. Individual band results
are not displayed. These limits are the OSHA-based octave-band maximum
permissible ambient noise levels (MPANLs) for the Sennheiser HD 280 Pro,
from Table 1 of Margolis, Saly, and Wilson ([2022](#references)). That study
extends the
[OSHA 29 CFR 1910.95 Appendix D](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.95AppD)
room limits (40, 40, 47, and 57 dB SPL for supra-aural earphones) by adding
the extra attenuation of circumaural earphones. The limits assume the
participant is wearing HD 280 Pro headphones. They are octave-band, not
one-third-octave, limits.

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
3. **MCL calibration:** each test gets a random offset
   e = 0.2 × max(0, better-ear PTA − 20) + σz, with z ~ N(0, 1), modelling the
   perceptual calibration error. Stimuli are e dB louder than intended.

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

| MCL offset SD σ | Raw staircase | Unpooled | Scaled PCA (current) |
|-----------------|---------------|----------|----------------------|
| 0 dB (hearing-loss term only) | 7.5 | 6.1 | 7.0 |
| 4 dB | 8.0 | 7.0 | 7.4 |
| 8 dB | 9.5 | 8.8 | 8.8 |
| 12 dB | 11.5 | 11.3 | 11.5 |

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
- **MCL calibration:** with the literature-based σ of ~8 dB, the
  perceptual-calibration error dominates the result, and the PCA fit
  performs about the same as the unpooled fit. Under the hearing-loss term
  alone (σ = 0), the PCA fit has a −4.7 dB mean bias, because both the MCL
  shift and the population prior push large losses downward.

Both-ears mode can identify only the better ear. The simulation assumes the
model's own 5 dB psychometric slope; lapses are 50/50 guesses.

Run it with `node scripts/pcaRecoverySimulation.js [report.json] [repetitions] [calibration,lapse,mcl]`
(default: `calibration,lapse`).

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
- `js/perceptualCalibration.js` — optional coupler or perceptual (MCL) level
  calibration panel on the screening page.
- `js/playAudio.js` — tone playback, response collection, and raw thresholds.
- `js/pca.js` — trained PCA parameters and reconstruction functions.
- `js/results.js` — result display and CSV export.
- `css/style.css` — page styling.
- `images/` — logos and visual assets.

The application keeps answers and test results in browser `sessionStorage`.
They are used to move data between pages during a session and are cleared when
the session ends or the browser clears site data.

## References

- Al-Salim, S. C., Kopun, J. G., Neely, S. T., Jesteadt, W., Stiegemann, B., & Gorga, M. P. (2010). Reliability of categorical loudness scaling and its relation to threshold. *Ear and Hearing*, *31*(4), 567–578. <https://doi.org/10.1097/AUD.0b013e3181da4d15>
- Berger, K. W., Harrison, L. D., Monack, N., & Ferren, G. E. (1980). Comfortable loudness judgments for discrete frequency signals. *Journal of Auditory Research*, *20*(2), 119–127. PMID 7345058.
- Dirks, D. D., & Kamm, C. (1976). Psychometric functions for loudness discomfort and most comfortable loudness levels. *Journal of Speech and Hearing Research*, *19*(4), 613–627. <https://doi.org/10.1044/jshr.1904.613>
- Hawley, M. L., Sherlock, L. P., & Formby, C. (2017). Intra- and intersubject variability in audiometric measures and loudness judgments in older listeners with normal hearing. *Seminars in Hearing*, *38*(1), 3–25. <https://doi.org/10.1055/s-0037-1598063>
- Hochberg, I. (1975). Most comfortable listening for the loudness and intelligibility of speech. *Audiology*, *14*(1), 27–33. <https://doi.org/10.3109/00206097509071720>
- Kamm, C., Dirks, D. D., & Mickey, M. R. (1978). Effect of sensorineural hearing loss on loudness discomfort level and most comfortable loudness judgments. *Journal of Speech and Hearing Research*, *21*(4), 668–681. <https://doi.org/10.1044/jshr.2104.668>
- Margolis, R. H., Saly, G. L., & Wilson, R. H. (2022). Ambient noise monitoring during pure-tone audiometry. *Journal of the American Academy of Audiology*, *33*(1), 45–56. <https://doi.org/10.1055/s-0041-1735803>
- Masalski, M., & Kręcicki, T. (2013). Self-test web-based pure-tone audiometry: Validity evaluation and measurement error analysis. *Journal of Medical Internet Research*, *15*(4), e71. <https://doi.org/10.2196/jmir.2222>
- Masalski, M., Grysiński, T., & Kręcicki, T. (2018). Hearing tests based on biologically calibrated mobile devices: Comparison with pure-tone audiometry. *JMIR mHealth and uHealth*, *6*(1), e10. <https://doi.org/10.2196/mhealth.7800>
- Punch, J., Joseph, A., & Rakerd, B. (2004). Most comfortable and uncomfortable loudness levels: Six decades of research. *American Journal of Audiology*, *13*(2), 144–157. <https://doi.org/10.1044/1059-0889(2004/019)>
- Smull, C. C., Madsen, B., & Margolis, R. H. (2019). Evaluation of two circumaural earphones for audiometry. *Ear and Hearing*, *40*(1), 177–183. <https://doi.org/10.1097/AUD.0000000000000585>
