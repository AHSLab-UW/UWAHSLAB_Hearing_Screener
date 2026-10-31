# UW AHSLAB Hearing Screener

A browser-based hearing screener from the University of Washington Auditory Human
Systems Laboratory (AHSLAB). The screener plays tones at several frequencies,
records trial-by-trial Yes/No responses, and estimates a Hearing Number and
frequency-specific thresholds using a PCA-informed psychometric model that
makes the results robust to occasional lapses of attention.

**Try it online:** <https://faculty.washington.edu/shenyi/AHSLAB_Hearing_Screener/>

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

Each test tone is presented as three 200 ms pulses, measured from onset to
offset, with 35 ms rise and fall ramps and 200 ms silent intervals. The smooth
ramps avoid abrupt amplitude switching; pulsed tones are consistent with
manual pure-tone audiometry guidance. In a comparison study, pulsed and
continuous tones produced comparable thresholds and test–retest reliability,
and listeners preferred pulsed tones for low-level or high-frequency tones
(ASHA, 1978; Burk & Wiley, 2004). This applies only to screening stimuli;
the optional level-calibration reference tone remains continuous.

## Transducers and level calibration

The **Level calibration** panel on the screening page has a transducer switch
with two categories. The choice is saved on the device and sets the dB HL to
dB SPL conversion (`dB SPL = dB HL + RETSPL`):

1. **Supra-/circumaural headphones** (default). Recommended: **Sennheiser HD
   280 Pro** (closed-back, circumaural). RETSPLs from Smull, Madsen, and
   Margolis ([2019](#references)), measured in an IEC 60318 coupler with a
   flat-plate adapter.
2. **Bluetooth earbuds.** Recommended: **Apple AirPods**. RETSPLs from Ho,
   Li, and Young ([2017](#references)), measured with 36 normal-hearing adults
   (72 ears). That study measured wired **Apple EarPods (MB770G)**; no
   AirPods RETSPLs have been published, so these values are an approximation
   for AirPods. Turn off noise cancellation, transparency, Conversation
   Awareness, Headphone Accommodations, and volume limits during calibration
   and screening.

| Frequency (Hz) | HD 280 Pro RETSPL (dB SPL) | EarPods RETSPL (dB SPL, mean ± SD) |
|----------------|----------------------------|------------------------------------|
| 500 | 6.8 | 9.5 ± 6.3 |
| 1000 | 1.4 | 4.4 ± 6.9 |
| 2000 | 1.9 | 0.0 ± 5.7 |
| 4000 | 2.2 | 6.7 ± 6.3 |

The values are stored by frequency in `TRANSDUCERS` in
[`js/perceptualCalibration.js`](js/perceptualCalibration.js). Other
transducers would need their own RETSPLs. The transducer is locked when a
screening starts, and the CSV export reports the transducer, RETSPL source,
and values used. The ambient-noise limits assume HD 280 Pro attenuation.
Earbuds without noise cancellation block much less room noise, so those
limits are too lenient for earbuds. Browsers cannot read or lock the device
volume, so the digital-to-acoustic level is set by an optional level
calibration (below).

### Optional level calibration

The screening page has a collapsible **Level calibration** bar next to the
room-noise bar. Calibration is opt-in and is meant to be done once per
sitting. The result is stored in the browser's `localStorage` for 4 hours
and reused by later screenings with the same device, transducer, and volume
setting. One normal-hearing reference listener can calibrate for everyone
screened in that sitting; screened participants do not repeat calibration.
A calibration applies only to the transducer it was made with:
switching transducers requires a new one. **Clear calibration** removes it.
Earlier calibration versions (including uncorrected 80 dB SPL Medium and
legacy MCL) are not reused and must be repeated.
All test levels are relative to a
1 kHz reference tone generated at the digital level that would be 80 dB SPL
under the uncalibrated device assumption (0.1 amplitude = 93.5 dB SPL). The
code is in [`js/perceptualCalibration.js`](js/perceptualCalibration.js).

1. **Coupler / sound level meter.** With one earcup or earbud on a coupler
   matching the transducer's RETSPL reference (flat-plate adapter for the HD
   280 Pro), the operator plays the continuous reference tone and
   adjusts the device volume until the meter reads **80 dB SPL**, checks
   the other side, then saves. This is a separate continuous, 1 kHz
   reference-tone option, not the pulsed screening stimulus. Its actual
   SPL is unknown until measured. Accuracy also depends on the coupler,
   transducer fit, volume step size, and frequency response.
2. **Perceptual (no meter).** A **normal-hearing reference listener** first
   uses the device volume to give the continuous 1 kHz tone roughly
   **Medium** loudness. They then make four on-screen
   **Medium** settings with **Softer**/**Louder** (2 dB
   steps). The runs alternate ascending (starting too soft) and descending
   (starting too loud), with starting points randomized 12–20 dB from the
   running estimate so that button presses cannot be counted. The mean
   setting becomes a digital gain offset, and the app assumes that this level
   is **75 dB SPL per ear for diotic presentation**: the provisional
   monaural Medium anchor of 80 dB SPL minus a 5 dB binaural summation
   correction (see below). "Medium" means neither soft nor loud; it is a
   loudness-category judgment, **not most comfortable level (MCL)**.
   Balanced approaches can reduce directional bias, and averaging can
   reduce random within-listener scatter; neither removes systematic
   differences between reference listeners. If the settings span more than 12 dB, the
   calibration is saved but flagged (amber indicator) and a repeat is
   suggested. The settings can range from −30 to +20 dB around the reference;
   at a limit, the participant is asked to adjust the device volume and
   start again.

Without calibration, the screening still runs using the unverified device
assumption. When the screening starts, the calibration in effect is frozen
for that test and the panel is locked. The CSV export reports the method,
reference frequency, reference SPL, digital gain offset, completion and
expiry times. For perceptual calibration it explicitly records **Medium**,
the **assumed 75 dB SPL per ear**, diotic presentation, the 80 dB SPL
monaural anchor, the 5 dB binaural correction, mean digital setting,
the normal-hearing reference-listener basis,
setting count, SD, range, ascending-minus-descending difference, and
consistency flag. Individual adjustment tracks and settings are not saved
or exported; only summary results are retained. A test without calibration
is reported as not calibrated.

**Rationale for the provisional Medium anchor.** A defined loudness category
is distinct from a potentially broad comfort judgment. The normal-hearing
subset of Neely's *Quick Tests of Consonant Confusion and Loudness Growth*
([Zenodo dataset](https://doi.org/10.5281/zenodo.23090549)) provided 31 usable
1 kHz Medium estimates at 25 categorical units. In condition code 1, their
mean was 78.6 dB SPL when estimates were averaged across repeats, or
80.0 dB SPL when repeat judgments were pooled before estimation. This
supports **80 dB SPL as a rounded experimental anchor**, not an established
clinical reference. The archive's condition-code-to-pure-tone mapping
remains unconfirmed; transfer to this continuous-tone adjustment procedure
requires physical validation. This is not a relabeling of MCL data.

**Diotic binaural loudness correction.** The calibration oscillator feeds
the same 1 kHz signal to both output channels. A diotic tone is generally
louder than a monaural tone at the same per-ear SPL, so its per-ear
equal-loudness level must be lower. Schlittenlacher, Ellermeier, and Arseneau
([2014](#references)) measured responses to 1 kHz pure tones over
45–85 dB SPL and found approximately **5 dB** between monaural and diotic
levels producing equal reaction times. We use this as a **provisional
level-equivalent binaural gain**, giving 80 − 5 = **75 dB SPL per ear**
for diotic Medium. It is not a universal constant or a direct measurement
of the Medium category: their outcome was reaction time, and their review
reports considerable method-dependent variation. Direct 1 kHz loudness
matching by Whilby et al. ([2006](#references)) also shows level dependence.
The continuous-tone procedure and individual binaural gain require validation.

The physical coupler option remains **80 dB SPL per ear**, measured
separately on each side; no perceptual summation correction applies to
the meter. The uncalibrated digital mapping and RETSPLs are unchanged.
For perceptual calibration, if the average digital setting is s dB relative
to the nominal 80 dB reference, the stored gain offset is
s + (80 − 75) = **s + 5 dB**. This ensures that requesting 75 dB SPL
reproduces the selected diotic Medium amplitude, rather than merely
changing the label on an uncorrected 80 dB calibration.

**Anticipated screening error, including accurate device calibration.**
A shared-reference simulation used Neely's (2026) [Zenodo dataset](https://doi.org/10.5281/zenodo.23090549):
`qCLS_analysis.zip` supplied `qcls_data.mat` (raw loudness judgments,
condition/run identifiers, and audiometric thresholds), and `Data.zip`
supplied `QuickTests_DATA.xlsx` (test-ear and contralateral audiograms,
ages, and sexes). The dataset contains 100 listed CLS participants:
32 normal-hearing and 68 with hearing loss. The simulation excluded NH029
because raw CLS observations were absent and HL038/HL065 because their
contralateral audiograms were incomplete, leaving 97 participants.
Medium levels were interpolated at 25 categorical units using monotonic
fits to condition-1 1 kHz judgments within each repeat, without
extrapolation, then averaged within each reference listener.

The simulation used 97 participants, 31 normal-hearing
reference listeners, two simulated calibrations per reference, and 540
screenings per anchor. Ten participant-held-out folds estimated reference
setting variability from training normal-hearing listeners only. Each
held-out reference calibrated for other held-out participants. The real
screening staircase and the **fixed NHANES-trained PCA model** were used;
no PCA was trained on Zenodo. The four alternating Medium adjustments
were simulated, not measured in that dataset.
Their single-setting variability was estimated from training-fold
normal-hearing paired-repeat differences divided by √2 (SD 4.9–5.7 dB).
Four 2 dB adjustment tracks had randomized starts and assumed balanced
±3 dB directional biases. Each session's residual calibration error was
applied while generating the screening responses, before the PCA fit.

**The table below is the original monaural-reference simulation, not a
new simulation of binaural summation.** Its 80 dB SPL monaural anchor
corresponds to the app's 75 dB SPL per-ear diotic assumption only if
the reference listener's actual binaural level advantage is exactly 5 dB.
The table's 75 dB SPL row is a different monaural anchor choice, not
the corrected current protocol. Variation or error in the assumed
binaural advantage adds session uncertainty not quantified by these results.

The seven fixed monaural anchors below were prespecified comparison options. The
additional cross-validated normal-hearing mean anchor was estimated only
from training listeners (77.6–79.2 dB SPL across folds). Metrics give equal
weight to reference listeners, then sessions, then screened participants;
the accurate physical-calibration control uses matching participants and
response seeds.

| Calibration | Mean session calibration bias | Session calibration MAE | Final threshold bias | Final threshold MAE | Four-frequency average MAE |
|-------------|-------------------------------|-------------------------|----------------------|---------------------|----------------------------|
| Medium assumed 70 dB SPL | −8.1 dB | 10.0 dB | −8.6 dB | 11.4 dB | 10.5 dB |
| Medium assumed 75 dB SPL | −3.1 dB | 7.4 dB | −4.1 dB | 9.5 dB | 8.1 dB |
| Medium assumed 78 dB SPL | −0.1 dB | 7.3 dB | −1.2 dB | 9.1 dB | 7.5 dB |
| **Monaural Medium assumed 80 dB SPL (75 diotic if gain = 5 dB)** | **+1.9 dB** | **7.6 dB** | **+0.8 dB** | **9.3 dB** | **7.7 dB** |
| Medium assumed 82 dB SPL | +3.9 dB | 8.4 dB | +2.6 dB | 9.6 dB | 8.2 dB |
| Medium assumed 85 dB SPL | +6.9 dB | 9.9 dB | +5.4 dB | 10.5 dB | 9.2 dB |
| Medium assumed 90 dB SPL | +11.9 dB | 13.3 dB | +10.4 dB | 13.1 dB | 12.3 dB |
| Cross-validated normal-hearing mean | +0.5 dB | 7.5 dB | −0.7 dB | 9.2 dB | 7.6 dB |
| Accurate physical calibration | 0 dB | 0 dB | −1.2 dB | **5.9 dB** | **3.3 dB** |

Session calibration MAE is the mean absolute residual level error;
final threshold MAE is mean absolute error against clinical thresholds.
The four-frequency average MAE measures error in the test ear's arithmetic
mean threshold, rather than averaging the four absolute threshold errors.
Positive bias means
reported thresholds are too high. Final errors average test-ear thresholds
at 500, 1000, 2000, and 4000 Hz. Even accurate calibration leaves error
from the short response procedure and population-model reconstruction:
it does not imply error-free screening. The 80 dB anchor's threshold MAE
had a reference-cluster bootstrap 95% interval of 7.8–11.0 dB. The MAE
difference between 78 and 80 dB anchors was only 0.14 dB and not clearly
distinguishable (95% interval −0.30 to +0.57 dB).
Anchors of 78–80 dB SPL gave the lowest observed threshold MAEs; 70 dB SPL
underestimated thresholds, while 85–90 dB SPL increasingly overestimated
them. These comparisons support 80 dB SPL as a rounded provisional choice,
not a uniquely optimal anchor or a clinically validated reference.

For anchor A and reference Medium M expressed on the same presentation
basis (monaural for the table; diotic per ear for the app), residual
nominal-level error is A − M. Unknown common device gain cancels, but this
reference-listener error is shared by everyone screened in the session.
Its simulated SD was **9.7 dB**; at the 80 dB anchor, the 90th percentile
absolute calibration error was **15.7 dB**. More screened participants do
not average away that session error.

These are conditional simulations, not validated deployment accuracy:
they assume independent setting variability, balanced directional biases,
a 5 dB psychometric slope, and stable frequency-independent device gain.
They exclude noise, lapses, binaural loudness effects, frequency-response
errors, and participant-specific headphone fit. Finite-repeat uncertainty
in the reference Medium estimates was not deconvolved. A 1 kHz reference
does not establish the full transducer response. **Use physical calibration
whenever possible**, and repeat calibration if the device, volume, audio
processing, or transducer changes.

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
participant is wearing HD 280 Pro headphones.

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

**Objective: robustness to attentional lapses.** A short staircase is easily
derailed by a single lapse of attention: a missed tone that the participant
could hear, or a Yes when no tone was heard. Each response directly moves the 
staircase, and a single wrong answer near the stopping rule can shift a
threshold by 10 dB or more. The PCA fit makes the screener robust to such
lapses in two ways. First, the trained covariance pools evidence across
frequencies and ears, so one inconsistent response is weighed against all
other responses rather than determining a threshold on its own. Second,
leave-one-out cross-validation identifies and excludes responses that are
implausible given the rest of the participant's data.

The PCA mean and three-component loading matrix in [`js/pca.js`](js/pca.js)
were trained using a large NHANES database. They provide population-informed
bases for predicting the four-frequency threshold profile in each ear.
Rather than fitting those bases to the test's threshold-crossing summaries,
the application fits them to the original trial-by-trial stimuli and Yes/No
responses.

**Training data and provenance.** The mean and loadings in `js/pca.js` come
from an unscaled PCA model trained on NHANES 2011–2012 data. The training data
join the audiometry file (`AUX_G.xpt`) with the demographics file
(`DEMO_G.xpt`) on `SEQN`, then use age, sex, and the eight 500–4000 Hz
right- and left-ear thresholds. See the CDC's
[NHANES 2011–2012 AUX_G documentation](https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2011/DataFiles/AUX_G.htm#Eligible_Sample).
The model uses the 2011–2012 `AUX_G` cycle, rather than the 2015–2016 `AUX_I`
cycle.

NHANES 2011–2012 examined 9,338 participants overall; the PCA training data
are the 3,857 records (ages 20–69; 1,969 male, 1,888 female) with complete
values for all ten model variables (age, sex, and eight thresholds). The audiometry component was open
to adults aged 20–69, of all sexes and racial/ethnic backgrounds, in NHANES's
nationally representative U.S. civilian, noninstitutionalized population. A
trained examiner tested both ears in a sound-isolating room at a mobile
examination center, measuring thresholds at seven frequencies with a modified
Hughson–Westlake procedure, primarily using automated audiometry. The PCA uses
only the 500, 1000, 2000, and 4000 Hz measurements. See also the
[NHANES 2011–2012 audiometry procedures manual](https://wwwn.cdc.gov/nchs/data/nhanes/public/2011/manuals/audiometry_procedures_manual.pdf).

The number of principal components to retain was selected using 10-fold
cross-validation: candidate component counts were compared by their
out-of-fold reconstruction performance, with three components selected.
After selection, PCA was refit on the complete dataset using those three
components. The resulting full-data mean and loading vectors provide the
weights used by the screener.

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
prior SD must be the component's score SD, not 1. The SDs
(`PCA_SCORE_SD = [30.4, 11.7, 16.3]`) were estimated by projecting the NHANES
training records through the deployed mean and loadings and taking the SD of
each component score. The 26 complete-case records containing NHANES
non-response threshold codes (666 or 888), which the complete-case filter does
not remove, were excluded from this estimate (N = 3,831). Including them
inflates the √eigenvalues to about [152, 42, 35], which would make the priors
nearly flat. The deployed mean and loadings come from the fit that includes
these records. In the trained
model, the age and sex loadings are very small (about 0.014 score units per
year), so the prior shifts by less than 1 dB HL across the adult age range.
When a participant reports no difference between ears, only the **right ear**
is tested for efficiency. The selection page and screening instructions
explain that the left ear is not tested. Tones are routed to the right
channel, and only right-ear trial likelihoods enter the PCA fit; there is
no binaural detection probability or better-ear likelihood. The fixed
NHANES PCA model reconstructs both ears, with left-ear values inferred
from right-ear evidence and population covariance/prior patterns, not copied
from the right ear or measured from left-ear responses. The results page
and CSV explicitly label the left-ear thresholds and Hearing Number as
**inferred; not tested**. Such inference cannot exclude unnoticed asymmetry.
Participants reporting a difference still have each ear tested separately.
The diotic loudness correction applies only to perceptual calibration,
not to these monaural screening likelihoods.

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
ages 25/45/65/80, both sexes, each-ear and right-ear-only modes, and seven
ground-truth profiles (flat 0/20/40/60, high-frequency, sloping, asymmetric).
It compares four estimates: the raw staircase (last Yes level), an unpooled
per-frequency logistic fit, the legacy unit-variance PCA prior, and the
current scaled PCA prior. Errors are measured against the true thresholds.
Each experiment level reuses the same random seeds. The primary experiment
tests the intended purpose of the PCA fit, robustness to lapses. Two further
experiments document how the fit interacts with level-calibration errors,
which it is not designed to correct:

1. **Lapses (primary):** on a proportion of trials, the listener answers
   Yes/No at random.
2. **Calibration error:** a fixed, frequency-independent attenuation is
   applied to every stimulus in a test.
3. **Legacy MCL sensitivity experiment (not the current Medium protocol):** each test gets a random offset
   e = 0.2 × max(0, better-ear PTA − 20) + σz, with z ~ N(0, 1), modelling the
   perceptual calibration error. Stimuli are e dB louder than intended.

The tables below were generated before the right-ear-only workflow change.
They report each-ear testing (both ears tested separately), which is
unchanged; they do not validate inference of an untested left ear.
Single-ear mean absolute error (dB, 56 simulated tests per level):

| Lapse rate | Raw staircase | Unpooled | Scaled PCA (current) |
|------------|---------------|----------|----------------------|
| 0% | 8.7 | 5.8 | 5.1 |
| 5% | 10.4 | 7.0 | 5.2 |
| 10% | 11.5 | 8.2 | 5.3 |
| 20% | 14.9 | 11.2 | 6.3 |
| 30% | 17.7 | 13.3 | 7.1 |
| 50% | 22.7 | 18.6 | 11.2 |

| Attenuation | Raw staircase | Unpooled | Scaled PCA (current) |
|-------------|---------------|----------|----------------------|
| −20 dB | 10.4 | 18.0 | 20.4 |
| −10 dB | 5.1 | 10.1 | 11.8 |
| 0 dB | 8.7 | 5.8 | 5.1 |
| +10 dB | 17.7 | 10.6 | 8.2 |
| +20 dB | 27.3 | 20.3 | 17.4 |
| +30 dB | 36.6 | 30.1 | 26.2 |

| MCL offset SD σ | Raw staircase | Unpooled | Scaled PCA (current) |
|-----------------|---------------|----------|----------------------|
| 0 dB (hearing-loss term only) | 7.5 | 6.1 | 6.6 |
| 4 dB | 8.0 | 7.0 | 6.9 |
| 8 dB | 9.5 | 8.8 | 8.6 |
| 12 dB | 11.5 | 11.3 | 11.4 |

Interpretation:

- **Lapses:** the PCA fit is clearly more robust than either baseline. Its
  error grows by only ~2 dB up to a 30% lapse rate, because LOOCV removes
  responses that contradict the cross-frequency pattern (5% of trials
  excluded at a 30% lapse rate), and because the covariance pools
  information across frequencies and ears.
- **Calibration (interaction only):** the PCA fit does not remove
  calibration errors, and it is not intended to. The mean
  bias rises 0.94 dB per dB of attenuation,
  compared with ~0.93–0.99 for the baselines. The first trained component loads
  positively on all eight thresholds, so a uniform calibration offset looks
  exactly like a real flat change in hearing. No response-based model can
  separate the two without an external level reference. The slightly lower
  slope reflects shrinkage toward the population prior, which equally
  shrinks genuine losses, so it should not be read as a correction. The raw
  staircase looks best at −10 dB only because its own ~+8 dB step bias
  happens to cancel the offset.
- **Legacy MCL calibration (interaction only; not a validation of the current Medium protocol):** with the literature-based σ of
  ~8 dB, the perceptual-calibration error dominates the result, and the PCA
  fit performs about the same as the unpooled fit. Calibration accuracy must
  come from the calibration procedure. Under the hearing-loss term
  alone (σ = 0), the PCA fit has a −4.3 dB mean bias, because both the MCL
  shift and the population prior push large losses downward.

The current simulator scores the tested right ear in right-only mode;
left-ear inference accuracy requires separate validation. The simulation assumes the
model's own 5 dB psychometric slope; lapses are 50/50 guesses.

Run it with `node scripts/pcaRecoverySimulation.js [report.json] [repetitions] [calibration,lapse,mcl]`
(default: `calibration,lapse`).

The results page reports a Hearing Number for each ear, calculated as the
arithmetic mean of reconstructed thresholds at 500, 1000, 2000, and 4000 Hz,
alongside those frequency-specific thresholds. The number is presented as a
wellness-oriented snapshot to help people understand hearing differences,
not as a medical diagnosis. It is a population-informed estimate that is
robust to occasional lapses of attention, but it does not correct level
calibration errors. Systematic errors such as a calibration offset pass into
the reported thresholds, and genuine atypical profiles may also be smoothed.

## Project layout

- `index.html` — welcome page and starting point.
- `pages/` — survey, instructions, test, results, and follow-up pages.
- `js/perceptualCalibration.js` — optional coupler or normal-hearing Medium level
  calibration panel on the screening page.
- `js/playAudio.js` — tone playback, response collection, and raw thresholds.
- `js/pca.js` — trained PCA parameters and reconstruction functions.
- `js/results.js` — result display and CSV export.
- `css/style.css` — page styling.
- `images/` — logos and visual assets.

The application keeps answers and test results in browser `sessionStorage`.
They are used to move data between pages during a session and are cleared when
the session ends or the browser clears site data.

## License

Released under the [MIT License](LICENSE). This is a research and wellness
screening tool, not a medical device. It does not provide a diagnosis.

## References

- Al-Salim, S. C., Kopun, J. G., Neely, S. T., Jesteadt, W., Stiegemann, B., & Gorga, M. P. (2010). Reliability of categorical loudness scaling and its relation to threshold. *Ear and Hearing*, *31*(4), 567–578. <https://doi.org/10.1097/AUD.0b013e3181da4d15>
- American Speech-Language-Hearing Association. (1978). Guidelines for manual pure-tone audiometry. *Asha*, *20*, 279–301.
- Berger, K. W., Harrison, L. D., Monack, N., & Ferren, G. E. (1980). Comfortable loudness judgments for discrete frequency signals. *Journal of Auditory Research*, *20*(2), 119–127. PMID 7345058.
- Burk, M. H., & Wiley, T. L. (2004). Continuous versus pulsed tones in audiometry. *American Journal of Audiology*, *13*(1), 54–61. <https://doi.org/10.1044/1059-0889(2004/008)>
- Dirks, D. D., & Kamm, C. (1976). Psychometric functions for loudness discomfort and most comfortable loudness levels. *Journal of Speech and Hearing Research*, *19*(4), 613–627. <https://doi.org/10.1044/jshr.1904.613>
- Hawley, M. L., Sherlock, L. P., & Formby, C. (2017). Intra- and intersubject variability in audiometric measures and loudness judgments in older listeners with normal hearing. *Seminars in Hearing*, *38*(1), 3–25. <https://doi.org/10.1055/s-0037-1598063>
- Ho, C.-Y., Li, P.-C., & Young, S.-T. (2017). Reference equivalent threshold sound pressure levels for Apple EarPods. *The Journal of the Acoustical Society of America*, *141*(2), EL115–EL119. <https://doi.org/10.1121/1.4976110>
- Hochberg, I. (1975). Most comfortable listening for the loudness and intelligibility of speech. *Audiology*, *14*(1), 27–33. <https://doi.org/10.3109/00206097509071720>
- Kamm, C., Dirks, D. D., & Mickey, M. R. (1978). Effect of sensorineural hearing loss on loudness discomfort level and most comfortable loudness judgments. *Journal of Speech and Hearing Research*, *21*(4), 668–681. <https://doi.org/10.1044/jshr.2104.668>
- Margolis, R. H., Saly, G. L., & Wilson, R. H. (2022). Ambient noise monitoring during pure-tone audiometry. *Journal of the American Academy of Audiology*, *33*(1), 45–56. <https://doi.org/10.1055/s-0041-1735803>
- Masalski, M., & Kręcicki, T. (2013). Self-test web-based pure-tone audiometry: Validity evaluation and measurement error analysis. *Journal of Medical Internet Research*, *15*(4), e71. <https://doi.org/10.2196/jmir.2222>
- Masalski, M., Grysiński, T., & Kręcicki, T. (2018). Hearing tests based on biologically calibrated mobile devices: Comparison with pure-tone audiometry. *JMIR mHealth and uHealth*, *6*(1), e10. <https://doi.org/10.2196/mhealth.7800>
- Neely, S. (2026). *Quick Tests of Consonant Confusion and Loudness Growth* [Data set]. Zenodo. <https://doi.org/10.5281/zenodo.23090549>
- Punch, J., Joseph, A., & Rakerd, B. (2004). Most comfortable and uncomfortable loudness levels: Six decades of research. *American Journal of Audiology*, *13*(2), 144–157. <https://doi.org/10.1044/1059-0889(2004/019)>
- Schlittenlacher, J., Ellermeier, W., & Arseneau, J. (2014). Binaural loudness gain measured by simple reaction time. *Attention, Perception, & Psychophysics*, *76*, 1465–1472. <https://doi.org/10.3758/s13414-014-0651-1>
- Smull, C. C., Madsen, B., & Margolis, R. H. (2019). Evaluation of two circumaural earphones for audiometry. *Ear and Hearing*, *40*(1), 177–183. <https://doi.org/10.1097/AUD.0000000000000585>
- Whilby, S., Florentine, M., Wagner, E., & Marozeau, J. (2006). Monaural and binaural loudness of 5- and 200-ms tones in normal and impaired hearing. *The Journal of the Acoustical Society of America*, *119*, 3931–3939. <https://doi.org/10.1121/1.2193813>
