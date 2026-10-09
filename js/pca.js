const mean =  [43.67098781436349, 1.4894996110967074, 14.68343271973036, 14.862328234379051, 15.25745397977703, 23.415867254342754, 13.516204303863105, 13.67487684729064, 14.408348457350272, 23.17241379310345] 
const weights = [[0.013564490137942193, 0.000349446262239326, 0.09374316970705628], [-0.0001232126056166516, -0.0002950878950020554, -0.0018082671556814978], [0.36670048790788584, 0.2309825228685524, -0.35290216254426804], [0.36884638285455357, 0.2324095562104278, -0.3315594897166317], [0.38519282746135086, 0.3296509715180547, -0.16382662810862783], [0.4125237838056605, 0.45535269452487964, 0.5872226864390946], [0.3123787922119594, -0.3812287543364457, -0.18737397897644273], [0.2938820832503796, -0.38926501687591136, -0.17228020072858097], [0.32577057857390035, -0.37373003707631924, -0.04742292428207023], [0.34738457417164237, -0.3742727168503456, 0.563940830140357]]
function transpose(A) {
    return A[0].map((_, col) => A.map(row => row[col]));
}

function matMul(A, B) {
    const rows = A.length;
    const cols = B[0].length;
    const inner = B.length;

    const result = Array.from({ length: rows }, () =>
        Array(cols).fill(0)
    );

    for (let i = 0; i < rows; i++) {
        for (let k = 0; k < inner; k++) {
            for (let j = 0; j < cols; j++) {
                result[i][j] += A[i][k] * B[k][j];
            }
        }
    }
    return result;
}

function centerData(X, mean) {
    return X.map(row =>
        row.map((value, j) => value - mean[j])
    );
}

function addMean(X, mean) {
    return X.map(row =>
        row.map((value, j) => value + mean[j])
    );
}

function pcaPredict(Xtest, trainMean, P) {
    const Xc = centerData(Xtest, trainMean);
    const scores = matMul(Xc, P);
    const reconstructedCentered = matMul(scores, transpose(P));
    const reconstructed = addMean(reconstructedCentered, trainMean);
    const residuals = Xtest.map((row, i) =>
        row.map((x, j) => x - reconstructed[i][j])
    );
    return { scores, reconstructed, residuals };
}

function runPCA() {
    const age = Number(sessionStorage.getItem("userAge"));
    const sexInput = sessionStorage.getItem("userSex");
    const sex = sexInput === "male" ? 1 : 2;
    const testmode = sessionStorage.getItem("testmode");

    const newOrder = [3, 0, 1, 2]; // reorders [1000, 2000, 4000, 500] → [500, 1000, 2000, 4000]

    let threshR, threshL;
    console.log("age:", age);
    console.log("sex:", sex);
    console.log("testmode:", testmode);

    if (testmode === "both") {
        const results = JSON.parse(sessionStorage.getItem("bothResults")) || [];
        const reordered = newOrder.map(index => results[index]);
        threshR = reordered; // right ear = same
        threshL = reordered; // left ear = duplicate
    } else {

        const rResults = JSON.parse(sessionStorage.getItem("rightResults")) || [];
        const lResults = JSON.parse(sessionStorage.getItem("leftResults")) || [];
       
        const reorderedRight = newOrder.map(index => rResults[index]);
        const reorderedLeft = newOrder.map(index => lResults[index]);
        threshR = reorderedRight;
        threshL = reorderedLeft;
    }
    console.log("threshR:", threshR);
    console.log("threshL:", threshL);
    // build Xtest — try completing this line
    
    const Xtest = [[age, sex, ...threshR, ...threshL]];
    console.log("Xtest:", Xtest);

    const result = pcaPredict(Xtest, mean, weights);
    console.log("reconstructed:", result.reconstructed);
    return result;
}