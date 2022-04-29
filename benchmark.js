const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const open = require('open');
var _ = require('lodash-fp')
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    args: [`--window-size=1920,1080`, '--use-fake-ui-for-media-stream', '--no-sandbox'],
    headless: false,
    devtools: true,
    defaultViewport: null
  })
  try {
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
          break
        default:
          break
      }
      commandIndex++
    }

    await browser.close()

    // // read benchmark
    const trace = JSON.parse(fs.readFileSync(`benchmark-result/${name}/${name}.json`, 'utf8'))

    // starting frame of benchmark
    const firstFrameSeqId = trace?.traceEvents.find(event => event.args.frameSeqId).args.frameSeqId 

    // get all events for DroppedFrames
    const droppedFrameEvents = trace?.traceEvents.filter(event => event.name === 'DroppedFrame')
      .filter(event => event.args.frameSeqId > firstFrameSeqId + 13) // do not count for the first 13 frames

    // get total number of frames
    const totalFrames = (trace?.traceEvents.filter(event => event.args.frameSeqId).length - firstFrameSeqId) - 13 // count only frames in the benchmark, do not count for the first 13 frames

    // get groups of dropped frames
    const groups = groupSequences(droppedFrameEvents.map(event => event.args.frameSeqId))

    // dates of first and last frames
    const firstFrameTime = new Date(trace?.traceEvents.filter(event => event.args.frameSeqId)[0].ts)
    const lastFrameTime = new Date(trace?.traceEvents.filter(event => event.args.frameSeqId)[trace?.traceEvents.filter(event => event.args.frameSeqId).length - 1].ts)

    // create dropped frames report (console)
    const metadata = trace.metadata

    console.log('Analyzing benchmark.json for dropped frames...\n')

    const percentageDropped = ((droppedFrameEvents.length / totalFrames) * 100).toFixed(2)
    const groupsDropped = groups.filter(group => group.length > 1).length

    fs.writeFileSync(
      `benchmark-result/${name}/${name}.html`,
      `
        <!doctype html>
          <html>
          <head>
            <title>${name}</title>
            <link rel="stylesheet" href="https://unpkg.com/@picocss/pico@latest/css/pico.min.css">
            <style>
              small {
                color: var(--muted-color);
              }
            </style>
          </head>
          <body>
            <main class="container">
              <hgroup>
                <h2>Benchmark: ${benchmarkName}</h2>
                <h3>${benchmarkDescription}</h3>
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
                    commands.map(({ command, payload, description}, index) => `
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
              
              <small><b>Date:</b> ${metadata['trace-capture-datetime']}</small>
              <br />
              <small><b>User Agent:</b> ${metadata['user-agent']}</small>
              <br />
              <small><b>Hardware:</b> ${metadata['num-cpus']} CPUs | ${(metadata['physical-memory'] / 1024).toFixed(0)} GB - ${metadata['cpu-brand']}\n</small>
              <br />
              <br />
              <table style="table-layout: fixed;">
                <tbody>
                  <tr>
                    <td><b>Duration</b></td>
                    <td>${((lastFrameTime - firstFrameTime) * 0.000001).toFixed(0)} seconds</td>
                  </tr>
                  <tr>
                    <td><b>Total Frames</b></td>
                    <td>${totalFrames}</td>
                  </tr>
                  <tr>
                    <td><b>Dropped Frames</b></td>
                    <td>${droppedFrameEvents.length}</td>
                  </tr>
                  <tr>
                    <td><b>Percentage Dropped</b></td>
                    <td ${percentageDropped > 5 ? 'style="color:red;";' : ''}>${percentageDropped}%</td>
                  </tr>
                  <tr>
                    <td><b>Groups of > 1 dropped frames</b></td>
                    <td ${groupsDropped > 0 ? 'style="color:red;";' : ''}>${groupsDropped}</td>
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
                    groups.map((group, index) => {
                      const time = `${((new Date((trace?.traceEvents.find(event => group[0] === event.args.frameSeqId)).ts) - firstFrameTime)* 0.001).toFixed(0)} - ${((new Date((trace?.traceEvents.find(event => group[group.length - 1] === event.args.frameSeqId)).ts) - firstFrameTime)* 0.001).toFixed(0)}`
                      const durationAffected = (group.length * (1000 / 60)).toFixed(2)
                      const droppedFrames = group.length
                      const percentageOfTotalDropped = ((group.length / droppedFrameEvents.length) * 100).toFixed(0)
                      const flag = durationAffected > ((1000/60) * 2)
                      return `
                        <tr>
                          <td ${flag ? 'style="color:red;";' : ''}>${index}</td>
                          <td ${flag ? 'style="color:red;";' : ''}>${time}</td>
                          <td ${flag ? 'style="color:red;";' : ''}>${durationAffected}</td>
                          <td ${flag ? 'style="color:red;";' : ''}>${droppedFrames}</td>
                          <td ${flag ? 'style="color:red;";' : ''}>${percentageOfTotalDropped}%</td>
                        </tr>
                      `
                    }).join('\n')
                  }
                </tbody>
              </table>
            </main>
          </body>
        </html>
      `
    )

    await open(`benchmark-result/${name}/${name}.html`)

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