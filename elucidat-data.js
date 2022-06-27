const axios = require('axios');
const cheerio = require('cheerio');
const Papa = require('papaparse')
const fs = require('fs');
const path = require('path');
const secrets = require('./secrets');
const curlconverter = require('curlconverter')

const { autoUpdater, ipcRenderer } = require('electron');


let elucidatProjectIDs = []

// ***** PROJECT LIST SCRAPING VARIABLES ***** //
// The folder to pull projects from. There are lots of filter options for projects scraping that can be set. 
// See makeElucidatProjectDataRequest function for details
const folderIds = ['28983']
const elucidatProjectsOutputFileName = 'elucidatProjects.csv'
// ******************************************* //

// ******** LEARNER SCRAPING VARIABLES ****** //
const learnerDataOutputFile = 'AIA-LearnerData-projectsFromElucidat-niceDates.csv'

// The file containing project_codes we want to scrape learner data for
const elucidatProjectFilePath = 'elucidatProjects.csv'

// ******************************************* //

console.log(secrets)



// New variables for electron stuff
let chosenOutputPath

/////////
// Method for pulling project data based on folder and search term
// returns data from https://app.elucidat.com/projects page
// @folderIds - numericalID of an Elucidat folder. Can be found in payload of https://app.elucidat.com/projects/ request in browser
// @searchTerm - text phrase to filter projects by (often this is a client acronym or offering acronym)
async function getElucidatProjectData(folderIds, searchTerm = '') {
    return new Promise(async (res, rej) => {
        let allProjectData = []
        for (let i = 0; i < folderIds.length; i++) {

            try {
                const folderId = folderIds[i]
                let totalRecords;
                let startAt = 0;
                while (totalRecords === undefined || startAt < totalRecords) {
                    const pageofProjectData = await makeElucidatProjectDataRequest(folderId, startAt, searchTerm)
                    totalRecords = pageofProjectData.total
                    startAt = pageofProjectData.to


                    // Add everything to the main array (could be more efficient since we don't need to modify it like we do in learner data)
                    pageofProjectData.results.forEach(d => {
                        allProjectData.push(d)
                    }
                    )
                }

            } catch (e) {
                // Swallowing errors
                console.error(`Something broke - ${folderId} - I: ${i}`);
                console.error(e)
            }
        }
        // OPTION: could make one CSV per study by moving the next two lines up into the for loop and appending study id to file name (and clearing recruitmentChangesOutput variable after each write)
        const csv = Papa.unparse(allProjectData);
        fs.writeFile(elucidatProjectsOutputFileName, csv, function (err) {
            if (err) return console.log(err);
            console.log(`Elucidat project file created: ${elucidatProjectsOutputFileName}`);
            res()
        });
    })
}

/************************/
/**** Helper Methods ****/
/************************/
async function readElucidatProjectIds(fileToRead) {
    const file = fs.createReadStream(fileToRead);

    return new Promise((resolve, reject) => {
        console.log('Parsing file starting')
        Papa.parse(file, {
            header: true,
            dynamicTyping: false,
            step: function (result) {
                let projectId = result.data["project_code"]
                elucidatProjectIDs.push(projectId)
            },
            complete: function (results, file) {
                console.log('Parsing file complete');
                // Remove duplicates
                const uniqueProjectIds = [...new Set(elucidatProjectIDs)];
                elucidatProjectIDs = uniqueProjectIds
                console.log(`Found ${elucidatProjectIDs.length} projects`)
                resolve(uniqueProjectIds)
            },
            error: function (e) {
                console.error(e)
                // swallowing 
            }
        });
    }
    )
}

async function makeElucidatProjectDataRequest(folderId, startAt, filter = '') {
    const url = 'https://app.elucidat.com/projects/'
    const per_page = 100
    const skip = startAt
    return new Promise(async (resolve, reject) => {
        try {

            // BUG - if there is no value for 'filter' the results are not filtered by folder either (resposne will have filtered: false)
            // Strangely if you use standard 'fetch' instead of axios it seems to work as expected
            const searchParams = new URLSearchParams({
                'action': 'filter',
                'project_type': 'all',
                filter,
                'show': 'all',
                'folders': 27958,
                'order': 'alpha',
                skip,
                per_page
            })
            const response = await axios.post(
                url,
                searchParams,
                {
                    headers: {
                        'cookie': secrets.elucidat.cookie,
                        'authorization': secrets.elucidat.authorization,
                        'authority': 'app.elucidat.com',
                        'accept': '*/*',
                        'accept-language': 'en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7',
                        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'origin': 'https://app.elucidat.com',
                        'referer': 'https://app.elucidat.com/projects',
                        'x-requested-with': 'XMLHttpRequest'
                    }
                }
            );
            resolve(response.data)
        } catch (e) {
            reject(e)
        }
    })
}

function validateInput(input) {
    if (input.value.length === 0) {
        input.classList.add("redBorder")
        return false
    } else {
        input.classList.remove("redBorder")
        return true
    }
}
async function scrapeData() {
    // Check that everything is filled out
    console.log('Scraping started')
    const inputs = [txtProjectList, txtCurlCommand, txtOutputDirectory]
    let allValid = true
    inputs.forEach(e => {
        if (validateInput(e) === false) {
            allValid = false
        }
    })
    listErrors.innerHTML = ''
    if (!allValid) {
        divErrorMsg.classList.add("show")
        divErrorMsg.classList.remove("hide")
        const errorElement = document.createElement('li')
        errorElement.innerText = 'Make sure all fields are filled out'
        listErrors.appendChild(errorElement)
        return
    } else {
        divErrorMsg.classList.add("hide")
        divErrorMsg.classList.remove("show")
    }

    btnMain.classList.add('inProgress')
    btnMain.classList.remove('readyToScrape')
    btnMain.value = "In progress..."
    const auth = txtCurlCommand.value
    setSecrets(auth)

    const projectInput = txtProjectList.value
    // Splitting project IDs by either a comma, spaces, or newline
    const projectIds = projectInput.split(/(?:,|[ ]+|[\r\n]+)+/)

    // Chosen outputPath is set when the user uses the directory picker dialog
    console.log('SENDING MESSAGE')
    window.postMessage({
        type: 'scrapeLearnerData',
        projectIds,
        outputPath: chosenOutputPath,
        cookie: secrets.elucidat.cookie
    })
}


/* Old code from pre-electron days
async function mainThing() {
    // Comment / Uncomment to pull project data or learner data


    const allIds = await readElucidatProjectIds(elucidatProjectFilePath)
    const projectIds = ['123123sad', '2awdlaskdj', 'sdlaskdj']
    await scrapeLearnerData(projectIds)

    // Method for pulling project data based on folder and search term
    // returns data from https://app.elucidat.com/projects page
    // await getElucidatProjectData(folderIds, '')

    console.log("All Done")
}

// mainThing()
*/

function setSecrets(auth) {
    const curlJSON = JSON.parse(curlconverter.toJsonString(auth))
    console.log(curlJSON)
    secrets.elucidat.authorization = curlJSON.headers.authorization
    console.log(curlJSON.headers.cookie === secrets.elucidat.cookie)
    secrets.elucidat.cookie = curlJSON.headers.cookie
    console.log(curlJSON.headers.cookie === secrets.elucidat.cookie)
}

/* Set up click handlers on window load */

function showHideAuth() {

    if (authShowing) {
        spanShowHide.innerText = "Initial Set Up (click to show)"
        divCurlCommandSection.style.display = "none"
    } else {
        spanShowHide.innerText = "Initial Set Up (click to hide)"
        divCurlCommandSection.style.display = "block"
    }

    authShowing = !authShowing
}

async function pickOutputDirectory() {

    console.log('Picking Output')
    window.postMessage({
        type: 'select-dirs'
    })

    // Everything from here is handled in main.js and the ipcRendered.on('sel-dir') method
}

ipcRenderer.on('sel-dir', (event, path) => {
    const pathAsString = path[0]
    document.getElementById('txtOutputDirectory').value = pathAsString
    chosenOutputPath = pathAsString
})

ipcRenderer.on('pull-complete', (event, errors) => {
    btnMain.classList.remove('inProgress')
    btnMain.classList.add('readyToScrape')
    btnMain.value = "Start Scraping"
    console.log('Pull Complete', event, errors)
    if (errors.length > 0) {
        listErrors.innerHTML = ''
        divErrorMsg.classList.add("show")
        divErrorMsg.classList.remove("hide")

        // Put an eye catching item up top
        const errorHeaderLI = document.createElement('li')
        errorHeaderLI.innerText = 'ERRORS OCCURRED DURING DATA PULL'
        listErrors.appendChild(errorHeaderLI)

        errors.forEach(e => {
            const errorElement = document.createElement('li')
            errorElement.innerText = `${e.projectId} - ${e.error}`
            listErrors.appendChild(errorElement)
        })
    } else {
        alert(`Pull Complete! Data saved to ${chosenOutputPath}`)
    }
    
})

function showPopup() {
    window.postMessage({
        type: 'show-instructions'
    })
}


let authShowing = true
const spanShowHide = document.getElementById("headerHideShowCookieAuth")
const divCurlCommandSection = document.getElementById("divCurlCommandSection")
const btnPickOutput = document.getElementById("btnPickOutput")
const txtCurlCommand = document.getElementById('txtCurlCommand')
const txtProjectList = document.getElementById('txtProjectListInput')
const btnMain = document.getElementById("btnMain")
const txtOutputDirectory = document.getElementById("txtOutputDirectory")
const listErrors = document.getElementById("listErrors")
const divErrorMsg = document.getElementById("divErrorMsg")
const popUpTrigger = document.getElementById("linkShowPopup")
const instructionsModal = document.getElementById("divInstructionsModal")

btnPickOutput.addEventListener('click', () => pickOutputDirectory())
spanShowHide.addEventListener('click', () => showHideAuth())
btnMain.addEventListener('click', () => scrapeData());
popUpTrigger.addEventListener('click', () => showPopup())