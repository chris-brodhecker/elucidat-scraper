const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const axios = require('axios');
const cheerio = require('cheerio');
const Papa = require('papaparse')
const fs = require('fs');
const path = require('node:path');
const contextMenu = require('electron-context-menu');

// see: https://www.npmjs.com/package/electron-context-menu
contextMenu({
	showSaveImageAs: true
});

let mainWindow

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 700,
        height: 700,
        icon: path.join(__dirname, '/elucidat-icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            spellcheck: false,
            
        },
    });
    mainWindow.loadURL(`file://${__dirname}/index.html`);
}

function createInstructionWindow() {
    const win = new BrowserWindow({
      height: 800,
      width: 1000
    });
  
    win.loadURL(`file://${__dirname}/instructions.html`);
  }

app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})


app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})


ipcMain.on('show-instructions', async (event) => {
    createInstructionWindow()
})

ipcMain.on('select-dirs', async (event, arg) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory']
    })
    console.log('directories selected', result.filePaths, event)
    event.sender.send('sel-dir', result.filePaths)
})

ipcMain.on('scrapeLearnerData', async (event, args) => {
    console.log('Scraping data')
    console.log(event, args)
    const errors = await scrapeLearnerData(args.projectIds, args.output, args.cookie)
    event.sender.send('pull-complete', errors)
})






// ELUCIDAT SCRAPING FUNCTIONS //
async function scrapeLearnerData(projectsIDsToScrape, outputDirectory, cookie) {
    let outputFile
    let errors = []
    return new Promise(async (res, rej) => {
        let allLearnerData = []
        for (let i = 0; i < projectsIDsToScrape.length; i++) {

            const projectId = projectsIDsToScrape[i]
            console.log(outputDirectory)
            console.log(projectId)
            outputFile = path.join(outputDirectory, `${projectId}`) + '.csv'
            
            try {

                let totalRecords;
                let startAt = 0;
                console.log(`Pulling for projectId ${projectId} ${i} of ${projectsIDsToScrape.length} `)
                while (totalRecords === undefined || startAt < totalRecords) {
                    const pageOfLearnerData = await makeLearnerDataRequest(projectId, startAt, cookie)
                    totalRecords = pageOfLearnerData.total
                    startAt = pageOfLearnerData.to


                    // If no learners took this course there will be no 'results' to parse
                    if (pageOfLearnerData.results !== undefined) {
                        pageOfLearnerData.results.forEach(d => {
                            if (d.completed) {
                                const dateArr = d.completed_date.split('/')
                                const completedDate = new Date(`${dateArr[1]}/${dateArr[0]}/${dateArr[2]}`)
                                const completedDateString = `${completedDate.toLocaleDateString('en')} ${completedDate.toLocaleTimeString('uk')}`
                                d.completed_date = completedDateString
                            }
                            const enrichedData = appendProjectId(projectId, d)

                            allLearnerData.push(enrichedData)
                        }
                        )
                    } else {
                        totalRecords = 0
                    }
                }

            } catch (e) {
                errors.push({ projectId, error: e.message })
                console.error(`Error! ${projectId} - I: ${i}`);
                console.error(e)
            }
        }

        // Output data to file
        const csv = Papa.unparse(allLearnerData);
        fs.writeFile(outputFile, csv, function (err) {
            if (err)  {
                errors.push({projectId: 'WritingOutput', error: err.message})
                return console.log(err);
            }
            console.log(`Learner data file created: ${outputFile}`);
            res(errors)
        });
    })
}

async function getLearnerDataFromJSVariable(text, variableName) {
    return new Promise((res, rej) => {
        try {
            const formattedVariableName = `var ${variableName} =`
            const chopFront = text.substring(text.search(formattedVariableName) + formattedVariableName.length, text.length);
            const JSONOnly = chopFront.substring(0, chopFront.search(";"));
            const parsedJSON = JSON.parse(JSONOnly);
            res(parsedJSON)
        } catch (e) {
            rej(e)
        }
    })
}

async function makeLearnerDataRequest(projectId, startAt, cookie) {
    const resultsPerPage = 100
    const baseUrl = 'https://app.elucidat.com/analyse/get_learner_data'
    // Get the history HTML for the study
    return new Promise(async (resolve, reject) => {
        const url = `${baseUrl}/${projectId}?skip=${startAt}&per_page=${resultsPerPage}`;
        try {
            const response = await axios.get(url,
                {
                    headers: {
                        Cookie: cookie,
                        'x-requested-with': 'XMLHttpRequest',
                        // 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.0.0 Safari/537.36',
                    }
                });

            // Before 'x-requested-with' header was discovered we had to parse the JS from an HTML response ****
            // const $ = cheerio.load(response.data);
            // const scriptParent = $('script')[0]
            // if (scriptParent.ufirstChild === null) {
            //     throw new Error(`Could not get data for ${projectId}`)
            // }
            // const scriptText = $('script')[0].firstChild.data
            // const learner_data = await getLearnerDataFromJSVariable(scriptText, "upload_data");

            const learner_data = response.data 
            console.log(learner_data)
            resolve(learner_data)
        } catch (e) {
            reject(e)
        }
    })
}

function appendProjectId(projectId, jsonObject) {
    const newJson = {
        ...jsonObject,
        'projectId': projectId
    }

    return newJson
}