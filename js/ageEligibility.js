const MINIMUM_ADULT_AGE = 18;
const MAXIMUM_PARTICIPANT_AGE = 120;

function isEligibleAdultAge(age) {
    return Number.isInteger(age) &&
        age >= MINIMUM_ADULT_AGE &&
        age <= MAXIMUM_PARTICIPANT_AGE;
}
