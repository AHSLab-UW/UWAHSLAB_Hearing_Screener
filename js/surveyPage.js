let nextButton = document.querySelector("#nextBttn");
nextButton.addEventListener("click", ()=>{
    let userSex = document.querySelector('input[name="userSex"]:checked');
    const age = Number(document.querySelector('input[name="age"]').value);
    if (!isEligibleAdultAge(age)) {
        sessionStorage.removeItem("userAge");
        if (Number.isInteger(age) && age > 0 && age < MINIMUM_ADULT_AGE) {
            alert("This hearing screening tool is for adults aged 18 or older. Participants under 18 cannot continue. Please seek age-appropriate hearing screening from a hearing care professional.");
        } else {
            alert("Please enter your age in whole years, from 18 to 120, before continuing.");
        }
        return;
    }
    if(userSex){
        sessionStorage.setItem("userSex", userSex.value);
        sessionStorage.setItem("userAge", age);
        console.log(userSex.value);
        console.log(age);
        window.location.href = "../pages/hearingDeviceLikert.html";
    } else {
        alert("Please select your sex before continuing.");
    }
})

const ageInput = document.getElementById('age');
const upBtn = document.getElementById('stepUp');
const downBtn = document.getElementById('stepDown');

upBtn.addEventListener('click', () => {
    ageInput.stepUp();
});

downBtn.addEventListener('click', () => {
    ageInput.stepDown();
});