let singleButton = document.querySelector("#singleEars");
singleButton.addEventListener("click", ()=>{
    sessionStorage.setItem("testmode", "single");
    window.location.href = "../pages/TestingPage.html";
})

let bothButton = document.querySelector("#bothEars");
bothButton.addEventListener("click", ()=> {
    sessionStorage.setItem("testmode", "right");
    window.location.href = "../pages/TestingPage.html";
})
