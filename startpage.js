let singleButton = document.querySelector("#singleEars");
singleButton.addEventListener("click", ()=>{
    sessionStorage.setItem("testmode", "single");
    window.location.href = "TestingPage.html";
})

let bothButton = document.querySelector("#bothEars");
bothButton.addEventListener("click", ()=> {
    sessionStorage.setItem("testmode", "both");
    window.location.href = "TestingPage.html";
})
