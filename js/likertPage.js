let likertButtons = document.querySelectorAll(".likert-item");

likertButtons.forEach( button => {
    button.addEventListener('click', () => {
        // Save the ID (e.g., likert1, likert2) to storage

        // Optional: Visual feedback (like a border) to show it was clicked
        likertButtons.forEach(btn => (btn.querySelector(".likert").style.border="none", btn.style.opacity="50%",
            btn.classList.remove('selected')));
        
        // Add it to the one clicked
        button.classList.add('selected');
        let icon = button.querySelector(".likert");
        icon.style.border = "2px solid #efc563";
        button.style.opacity = "100%";
        //console.log("likertResponse: " + button.querySelector("h4").textContent);
        
    });
});

let nextButton = document.querySelector("#nextBttn");
nextButton.addEventListener("click", ()=>{
    const selectedItem = document.querySelector(".likert-item.selected");

    if (selectedItem) {
        // 2. Get the text from the <h4> inside that selected div
        const selectedText = selectedItem.querySelector("h4").textContent;
        // 3. Save that text to sessionStorage
        sessionStorage.setItem(PAGE_KEY, selectedText);
        console.log("likertResponse: " + selectedText);
        window.location.href = NEXT_PAGE;
    } else {
        // 5. Alert the user if they haven't picked anything
        alert("Please select one of the options before moving to the next page.");
    }
})