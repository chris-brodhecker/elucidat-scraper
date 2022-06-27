const { ipcRenderer } = require('electron')

process.once('loaded', () => {
  window.addEventListener('message', evt => {
    if (evt.data.type === 'select-dirs') {
      ipcRenderer.send('select-dirs')
    }

    if (evt.data.type === 'scrapeLearnerData') {
        console.log('SCRAPING DATA')
        console.log(evt)
        const projectIds = evt.data.projectIds
        const output = evt.data.outputPath
        const cookie = evt.data.cookie
        console.log(projectIds, output)
        ipcRenderer.send('scrapeLearnerData', {projectIds, output, cookie})
      }

    if (evt.data.type === 'show-instructions') {
        ipcRenderer.send('show-instructions')
    }
  })
})