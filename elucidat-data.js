const axios = require('axios');
const cheerio = require('cheerio');
const Papa = require('papaparse')
const fs = require('fs');
const secrets = require('./secrets');

// CHANGE THESE STUDY IDS TO WHAT YOU WANT
let elucidatProjectIDs = []
const folderIds = ['59365']
// THIS IS THE FILE
const outputFileName = 'elucidatData.csv'
const elucidatProjectsOutputFileName = 'elucidatProjects.csv'
const learnerDataOutputFile = 'AIA-LearnerData-projectsFromElucidat-niceDates.csv'


const elucidatProjectFilePath = 'elucidatProjects.csv'
const resultsPerPage = 100

console.log(secrets)
async function readElucidatProjectIds(fileToRead) {
    const file = fs.createReadStream(fileToRead);
    var count = 0; // cache the running count


    return new Promise((resolve, reject) => {

        Papa.parse(file, {
            header: true,
            dynamicTyping: false,
            step: function (result) {
                let projectId = result.data["project_code"]
                elucidatProjectIDs.push(projectId)
            },
            complete: function (results, file) {
                console.log('Done parsing!');

                // scrapeRecruitmentStatus()

                // Remove duplicate
                const uniqueProjectIds = [...new Set(elucidatProjectIDs)];
                elucidatProjectIDs = uniqueProjectIds
                console.log(`Found ${elucidatProjectIDs.length} projects`)
                resolve(uniqueProjectIds)
            },
            error: function (e) {
                console.error(e)
            }
        });
    }
    )
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


async function scrapeLearnerData(projectsIDsToScrape) {
    return new Promise(async (res, rej) => {
        let allLearnerData = []
        for (let i = 0; i < projectsIDsToScrape.length; i++) {
            const projectId = projectsIDsToScrape[i]
            try {
                
                let totalRecords;
                let startAt = 0;
                console.log(`Pulling for projectId ${projectId} ${i} of ${projectsIDsToScrape.length} `)
                while (totalRecords === undefined || startAt < totalRecords) {
                    const pageOfLearnerData = await makeLearnerDataRequest(projectId, startAt)
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
                console.error(`Shit's fucked ${projectId} - I: ${i}`);
                console.error(e)
            }
        }

        // Output data to file
        const csv = Papa.unparse(allLearnerData);
        fs.writeFile(learnerDataOutputFile, csv, function (err) {
            if (err) return console.log(err);
            console.log(`Learner data file created: ${learnerDataOutputFile}`);
            res()
        });
    })
}

async function makeLearnerDataRequest(projectId, startAt) {
    const baseUrl = 'https://app.elucidat.com/analyse/get_learner_data'
    // Get the history HTML for the study
    return new Promise(async (resolve, reject) => {
        const url = `${baseUrl}/${projectId}?skip=${startAt}&per_page=${resultsPerPage}`;
        try {
            const response = await axios.get(url,
                {
                    headers: {
                        Cookie: secrets.elucidat.cookie
                    }
                });

            const $ = cheerio.load(response.data);
            const scriptText = $('script')[0].firstChild.data
            const learner_data = await getLearnerDataFromJSVariable(scriptText, "upload_data");
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


async function makeElucidatProjectDataRequest(folderId, startAt, filter = '') {
    const url = 'https://app.elucidat.com/projects/'
    const per_page = 100
    const skip = startAt
    return new Promise(async (resolve, reject) => {
        try {


            const response = await axios.post(
                'https://app.elucidat.com/projects/',
                new URLSearchParams({
                    'action': 'filter',
                    'project_type': 'all',
                    'filter': filter,
                    'show': 'all',
                    'folders': folderId,
                    'order': 'alpha',
                    skip,
                    per_page
                }),
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

async function getElucidatProjectData(folderIds) {
    return new Promise(async (res, rej) => {
        let allProjectData = []
        for (let i = 0; i < folderIds.length; i++) {

            try {
                const folderId = folderIds[i]
                let totalRecords;
                let startAt = 0;
                while (totalRecords === undefined || startAt < totalRecords) {
                    const pageofProjectData = await makeElucidatProjectDataRequest('all', startAt, 'AIA')
                    totalRecords = pageofProjectData.total
                    startAt = pageofProjectData.to


                    // Add everything to the main array (could be more efficient since we don't need to modify it like we do in learner data)
                    pageofProjectData.results.forEach(d => {
                        allProjectData.push(d)
                    }
                    )
                }

            } catch (e) {
                console.error(`Shit's fucked - ${folderId} - I: ${i}`);
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

async function mainThing() {
    // let output = await readStudyList()
    const allIds = await readElucidatProjectIds(elucidatProjectFilePath)
    await scrapeLearnerData(allIds)
    // await scrapeLearnerData()
    // await getElucidatProjectData(folderIds)

    console.log("All Done")
}

const o = mainThing()

//scrapeRecruitmentStatus()