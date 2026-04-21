const start = document.querySelector("#startBttn");
start.addEventListener("click", () => {
    sessionStorage.setItem("start-time", now.toLocaleString());
});
