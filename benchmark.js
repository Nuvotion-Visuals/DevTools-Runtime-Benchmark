const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const open = require('open');
var _ = require('lodash-fp')
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    args: [`--window-size=1920,1080`, '--use-fake-ui-for-media-stream', '--no-sandbox','--disable-gpu-driver-bug-workarounds'],
    headless: false,
    devtools: true,
    defaultViewport: null
  })
  try {
    const args = process.argv.slice(2);

    const { 
      benchmarkName, 
      benchmarkDescription, 
      commands, 
      url 
    } = JSON.parse(fs.readFileSync(`benchmarks/addScene.json`, 'utf8')) // replace with command line argument'
    // add command line argument explaining benchmark testing variation

    const now = new Date()
    const name = `benchmark_${benchmarkName}_${now.getFullYear()}-${now.getMonth() + 1}-${now.getDay()}-${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`

    // create benchmark results folder
    !fs.existsSync(`./benchmark-result/${name}`) && fs.mkdirSync(`./benchmark-result/${name}`, { recursive: true })

    // open page
    const page = await browser.newPage()

    // show FPS
    const devtoolsProtocolClient = await page.target().createCDPSession()
    await devtoolsProtocolClient.send('Overlay.setShowFPSCounter', { show: true })  
    
    await devtoolsProtocolClient.send('Log.enable')
    
    let consoleLogs = []
    devtoolsProtocolClient.on('Log.entryAdded', async ({ entry }) => {
      consoleLogs.push(entry)
    })

    await page.goto(url, { waitUntil: 'domcontentloaded' })

    
    let commandIndex = 0
    while (commandIndex < commands.length) {
      const { command, payload, description } = commands[commandIndex]
      switch(command) {
        case 'wait':
          console.log('wait', payload, description);
          await page.waitForTimeout(Number(payload))
          break
        case 'click':
          console.log('click', payload, description)
          await page.click(payload)
          break
        case 'trace':
          console.log('trace', payload, description)
          payload === 'start'
            ? await page.tracing.start({path: `benchmark-result/${name}/${name}.json`, screenshots: true})
            : await page.tracing.stop()

          if (payload === 'stop') {
            await devtoolsProtocolClient.send('Log.disable')
            fs.writeFileSync(
              `benchmark-result/${name}/${name}-console.json`,
              JSON.stringify(consoleLogs, null, 2)
            )
          }
          break
        default:
          break
      }
      commandIndex++
    }

    await browser.close()
    await browser.disconnect()

    // // read benchmark
    const trace = JSON.parse(fs.readFileSync(`benchmark-result/${name}/${name}.json`, 'utf8'))

    // starting frame of benchmark
    const firstFrameSeqId = trace?.traceEvents.find(event => event.args.frameSeqId).args.frameSeqId 

    // get all events for DroppedFrames
    const droppedFrameEvents = trace?.traceEvents.filter(event => event.name === 'DroppedFrame')

    // get total number of frames
    const totalFrames = (trace?.traceEvents.filter(event => event.args.frameSeqId).length - firstFrameSeqId) // count only frames in the benchmark

    // get groups of dropped frames
    const groups = groupSequences(droppedFrameEvents.map(event => event.args.frameSeqId))

    const droppedFrames = groups.map(group => group.length).reduce((a, b) => a + b)

    // dates of first and last frames
    const firstFrameTime = new Date(trace?.traceEvents.filter(event => event.args.frameSeqId)[0].ts)
    const lastFrameTime = new Date(trace?.traceEvents.filter(event => event.args.frameSeqId)[trace?.traceEvents.filter(event => event.args.frameSeqId).length - 1].ts)

    // create dropped frames report (console)
    const metadata = trace.metadata

    console.log('Analyzing benchmark.json for dropped frames...\n')

    const percentageDropped = ((droppedFrames / totalFrames) * 100).toFixed(2)
    const groupsDropped = groups.filter(group => group.length > 1).length

    const groupData = groups.map((group, index) => {
        const time = `${((new Date((trace?.traceEvents.find(event => group[0] === event.args.frameSeqId)).ts) - firstFrameTime)* 0.001).toFixed(0)} - ${((new Date((trace?.traceEvents.find(event => group[group.length - 1] === event.args.frameSeqId)).ts) - firstFrameTime)* 0.001).toFixed(0)}`
        const groupDroppedFrames = group.length
        const durationAffected = (groupDroppedFrames * (1000 / 60)).toFixed(2)
        const percentageOfTotalDropped = ((groupDroppedFrames / droppedFrames) * 100).toFixed(0)
        const flag = durationAffected > ((1000/60) * 2)
        return {
          index,
          time,
          durationAffected,
          groupDroppedFrames,
          percentageOfTotalDropped,
          flag
        }
      })

    const data = {
      benchmarkName,
      name,
      duration: ((lastFrameTime - firstFrameTime) * 0.000001).toFixed(0),
      totalFrames,
      droppedFrames,
      percentageDropped,
      groupsDropped,
      groupData,
      variation: args?.[0],
      commands,
      metadata
    }

    fs.writeFileSync(
      `benchmark-result/${data.name}/${data.name}-info.json`,
      JSON.stringify(data, null, 2)
    )

    fs.writeFileSync(
      `benchmark-result/${data.name}/${data.name}.html`,
      `
        <!doctype html>
          <html>
          <head>
            <title>${data.name} - DevTools Runtime Benchmark</title>
            <link rel="icon" href="favicon.ico" type="image/x-icon" />
            <link rel="stylesheet" href="https://unpkg.com/@picocss/pico@latest/css/pico.min.css">
            <style>
              small {
                color: var(--muted-color);
              }
              iframe {
                width: 100%;
                min-height: 800px;
                height: 90vh;
              }
              nav {
                background-color: var(--card-background-color);
                box-shadow: var(--card-box-shadow);
              }
              nav h1 {
                margin-bottom: 0;
                font-size: 1.25rem;
              }
              html {
                background-color: var(--background-color);
              }
            </style>
          </head>
          <body>
            <nav>
              <ul></ul>
              <ul>
                <li ><a href="/" style="display: flex;"><img style="width: 36px; margin-right: 16px;" src='icon.svg' /><h1>DevTools Runtime Benchmark</h1></a></li>
              </ul>
              <ul></ul>
            </nav>
            <main class="container">
              <hgroup>
                <h2>Benchmark: ${data.benchmarkName}</h2>
                <h3>${data.variation}</h3>
              </hgroup>

              <details>
                <summary>Benchmark Commands</summary>
                <table role="grid">
                <thead>
                  <tr>
                    <th scope="col"><b>Index</b></th>
                    <th scope="col"><b>Command</b></th>
                    <th scope="col"><b>Payload</b></th>
                    <th scope="col"><b>Description</b></th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    data.commands.map(({ command, payload, description}, index) => `
                        <tr>
                          <td>${index}</td>
                          <td>${command}</td>
                          <td>${payload}</td>
                          <td>${description}</td>
                        </tr>
                      `
                    ).join('\n')
                  }
                </tbody>
              </table>
              </details>
              
              <small><b>Date:</b> ${data.metadata['trace-capture-datetime']}</small>
              <br />
              <small><b>User Agent:</b> ${data.metadata['user-agent']}</small>
              <br />
              <small><b>Hardware:</b> ${data.metadata['num-cpus']} CPUs | ${(data.metadata['physical-memory'] / 1024).toFixed(0)} GB - ${data.metadata['cpu-brand']}\n</small>
              <br />
              <br />
              <table style="table-layout: fixed;">
                <tbody>
                  <tr>
                    <td><b>Duration</b></td>
                    <td>${data.duration} seconds</td>
                  </tr>
                  <tr>
                    <td><b>Total Frames</b></td>
                    <td>${data.totalFrames}</td>
                  </tr>
                  <tr>
                    <td><b>Dropped Frames</b></td>
                    <td>${data.droppedFrames}</td>
                  </tr>
                  <tr>
                    <td><b>Percentage Dropped</b></td>
                    <td ${data.percentageDropped > 5 ? 'style="color:red;";' : ''}>${data.percentageDropped}%</td>
                  </tr>
                  <tr>
                    <td><b>Groups of > 1 dropped frames</b></td>
                    <td ${data.groupsDropped > 0 ? 'style="color:red;";' : ''}>${data.groupsDropped}</td>
                  </tr>
                </tbody>
              </table>
              <br />
              <table role="grid">
                <thead>
                  <tr>
                    <th scope="col"><b>Index</b></th>
                    <th scope="col"><b>Time (ms)</b></th>
                    <th scope="col"><b>~ Duration Affected (ms)</b></th>
                    <th scope="col"><b>Dropped Frames</b></th>
                    <th scope="col"><b>% of Total Dropped</b></th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    data.groupData.map((data, index) => {
                      const { time, durationAffected, groupDroppedFrames, percentageOfTotalDropped, flag } = data
                      return `
                        <tr>
                          <td ${flag ? 'style="color:red;";' : ''}>${index}</td>
                          <td ${flag ? 'style="color:red;";' : ''}>${time}</td>
                          <td ${flag ? 'style="color:red;";' : ''}>${durationAffected}</td>
                          <td ${flag ? 'style="color:red;";' : ''}>${groupDroppedFrames}</td>
                          <td ${flag ? 'style="color:red;";' : ''}>${percentageOfTotalDropped}%</td>
                        </tr>
                      `
                    }).join('\n')
                  }
                </tbody>
              </table>
            </main>
            <iframe src='${`http://localhost:8833/?loadTimelineFromURL=http://localhost:4000/${data.name}/${data.name}.json`}'>
            </iframe>
          </body>
        </html>
      `
    )

    console.log(`Benchmark report generated: benchmark-result/${name}/${name}.html`)
  }
  catch(error) {
    console.log(error)
  }
})()

// group sequences of semi-consecutive dropped frames (dropped frames grouped within 5 frames of each other)
const groupSequences = (array) => (
  _.reduce((result, value, index, collection) => {
    const difference = value - collection[index - 1]
    if ([1, 2, 3, 4, 5].includes(difference)) {
      const group = _.last(result)
      group.push(value)
    } else {
      result.push([value])
    }
    return result
  }, [])(array)
)