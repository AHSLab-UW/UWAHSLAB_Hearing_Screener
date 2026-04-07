let nextButton = document.querySelector("#nextBttn");
nextButton.addEventListener("click", ()=>{
    let userSex = document.querySelector('input[name="userSex"]:checked');
    let age = document.querySelector('input[name="age"]').value;
    if(userSex && age && age>0){
        sessionStorage.setItem("userSex", userSex.value);
        sessionStorage.setItem("userAge", age);
        console.log(userSex.value);
        console.log(age);
        window.location.href = "hearingDeviceLikert.html";
    } else {
        alert("Please select an option before continuing.");
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