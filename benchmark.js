const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const open = require('open');
var _ = require('lodash-fp')
const fs = require('fs');
const percentile = require("percentile");

(async () => {
  const browser = await puppeteer.launch({
    args: [`--window-size=1920,1080`, '--use-fake-ui-for-media-stream', '--no-sandbox','--disable-gpu-driver-bug-workarounds'],
    headless: false,
    devtools: true,
    defaultViewport: null
  })
  try {
    const args = process.argv.slice(2);

    const benchmarkName = args?.[0]

    const { 
      benchmarkDescription, 
      commands, 
      url 
    } = JSON.parse(fs.readFileSync(`benchmarks/${benchmarkName}.json`, 'utf8')) // replace with command line argument'
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

    console.log('Analyzing benchmark.json for dropped frames...\n')

    // // read benchmark
    const trace = JSON.parse(fs.readFileSync(`benchmark-result/${name}/${name}.json`, 'utf8'))
    const traceEvents = trace?.traceEvents

    const frames = traceEvents.filter(event => event.name === 'BeginMainThreadFrame')

    const firstFrameTime = new Date(frames.find(event => event.name === 'BeginMainThreadFrame').ts * .001)

    const frameTimes = frames.map((frame, index) => 
      frames?.[index - 1]
        ? (frame.ts * .001).toFixed(0) - (frames?.[index - 1].ts * .001).toFixed(0)
        : 17
    )

    const timestampedFrameTimes = frames.map((frame, index) => ({
      frameNumber: index,
      startTime: frames?.[index - 1]?.ts 
        ? new Date(frames?.[index - 1]?.ts * .001) - firstFrameTime
        : 0,
      endTime: frames?.[index - 1]?.ts 
        ? new Date(frame.ts * .001) - firstFrameTime
        : 17,
      duration: frames?.[index - 1]
        ? (frame.ts * .001).toFixed(0) - (frames?.[index - 1].ts * .001).toFixed(0)
        : 17
    }))

    const totalFrames = frameTimes.length
    const totalTime = frameTimes.reduce((a, b) => a + b)
    const totalTimeSeconds = totalTime / 1000
    const averageFps = 1000 / (totalFrames / (totalTime / 1000)).toFixed(0)

    const metadata = trace.metadata

    const correspond = commands.slice(
      commands.findIndex(command => command.command === 'trace') + 1
    )

    let totalElapsed = 0
    const elapsedCommands = correspond.map(command => {
      if (command.command === 'wait') {
        totalElapsed += Number(command.payload)
      }
      return {
        elapsed: totalElapsed,
        ...command
      }
    }).filter(command => command.command === 'click')

    const usedIndicies = []
    const recommended = (startTime, index) => {
      const ind = elapsedCommands.findIndex((command) => command.elapsed > startTime - 700 && command.elapsed < startTime + 700) 
      const label = elapsedCommands.find(command => command.elapsed > startTime - 700 && command.elapsed < startTime + 700)?.description
      
      if (!usedIndicies.includes(ind)) {
        usedIndicies.push(ind)
        return label ? label : '-'
      }
      return '-'
    }

    const calculatePercentageOverFramerate = (fps) => 
      `${timestampedFrameTimes.filter(frame => frame.duration <= 1000 / fps).length}<br />${((timestampedFrameTimes.filter(frame => frame.duration <= 1000 / fps).length / timestampedFrameTimes.length) * 100).toFixed(0)}`
    
    let longFramesTime = 0
    const longFrames = timestampedFrameTimes?.filter(frame => frame.duration > 100)
    if (longFrames.length > 0) {
      longFramesTime = longFrames.map(frame => frame.duration)?.reduce((a, b) => a + b)
    }

    const data = {
      benchmarkName,
      name,
      frameTimes,
      timestampedFrameTimes,
      longFrames: longFrames
        .map(frame => ({
          ...frame,
          possibleCause: recommended(frame.startTime)
        })),
      totalTime,
      totalFrames: timestampedFrameTimes.length,
      totalTimeSeconds,
      averageFps,
      min: (1000 / Math.max(...frameTimes)).toFixed(0),
      max: (1000 / Math.min(...frameTimes)).toFixed(0),
      p1: (1000 / percentile(1, frameTimes)).toFixed(0),
      p10: (1000 / percentile(10, frameTimes)).toFixed(0),
      p25: (1000 / percentile(25, frameTimes)).toFixed(0),
      p50: (1000 / percentile(50, frameTimes)).toFixed(0),
      p75: (1000 / percentile(75, frameTimes)).toFixed(0),
      p90: (1000 / percentile(90, frameTimes)).toFixed(0),
      p99: (1000 / percentile(99, frameTimes)).toFixed(0),
      o25: calculatePercentageOverFramerate(25),
      o30: calculatePercentageOverFramerate(30),
      o35: calculatePercentageOverFramerate(35),
      o40: calculatePercentageOverFramerate(40),
      o45: calculatePercentageOverFramerate(45),
      o50: calculatePercentageOverFramerate(50),
      o55: calculatePercentageOverFramerate(55),
      o60: calculatePercentageOverFramerate(60),
      variation: args?.[1],
      commands,
      metadata,
      score:(((1000 / percentile(75, frameTimes)).toFixed(0) / 60) * 100).toFixed(0) - (longFramesTime / 100).toFixed(0)
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
                <summary><b>Commands</b></summary>
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

              <h1 style='margin-bottom: 0 !important; '>Score: ${data.score}</h1>
              <blockquote><b>How It's Calculated:</b> <i>100 * (P75 FPS / 60) - (milliseconds of Problematic Frames / 100)</i></blockquote>

              <h4>FPS Percentiles</h4>
              <table role="grid">
                <thead>
                  <tr>
                    <th scope="col"><b>Min</b></th>
                    <th scope="col"><b>P99</b></th>
                    <th scope="col"><b>P90</b></th>
                    <th scope="col"><b>P75</b></th>
                    <th scope="col"><b>P50</b></th>
                    <th scope="col"><b>P25</b></th>
                    <th scope="col"><b>P10</b></th>
                    <th scope="col"><b>P1</b></th>
                    <th scope="col"><b>Max</b></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>${data.min}</td>
                    <td>${data.p99}</td>
                    <td>${data.p90}</td>
                    <td>${data.p75}</td>
                    <td>${data.p50}</td>
                    <td>${data.p25}</td>
                    <td>${data.p10}</td>
                    <td>${data.p1}</td>
                    <td>${data.max}</td>
                  </tr>
                </tbody>
              </table>
              <blockquote><b>How to Read:</b> <i>P75: 75% of frametimes are better than X FPS.</i></blockquote>

              <h4>Minimum FPS Percentages</h4>
                <table role="grid">
                  <thead>
                    <tr>
                      <th scope="col"><b>25</b></th>
                      <th scope="col"><b>30</b></th>
                      <th scope="col"><b>35</b></th>
                      <th scope="col"><b>40</b></th>
                      <th scope="col"><b>45</b></th>
                      <th scope="col"><b>50</b></th>
                      <th scope="col"><b>55</b></th>
                      <th scope="col"><b>60</b></th>
                      <th scope="col"><b>Total</b></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>${data.o25}%</td>
                      <td>${data.o30}%</td>
                      <td>${data.o35}%</td>
                      <td>${data.o40}%</td>
                      <td>${data.o45}%</td>
                      <td>${data.o50}%</td>
                      <td>${data.o55}%</td>
                      <td>${data.o60}%</td>
                      <td>${data.timestampedFrameTimes.length}<br />100%</td>
                    </tr>
                  </tbody>
                </table>
                <blockquote><b>How to Read:</b> <i>30: X% of the frames were above 30 FPS</i></blockquote>

              <h4>Problematic Frames</h4>
              <table role="grid">
              <thead>
                <tr>
                  <th scope="col"><b>Frame Number</b></th>
                  <th scope="col"><b>Time Affected</b></th>
                  <th scope="col"><b>Duration</b></th>
                  <th scope="col"><b>Possible Cause</b></th>
                </tr>
              </thead>
              <tbody>
                ${
                  data.longFrames.map(({ startTime, endTime, duration, frameNumber, possibleCause }, index) => `
                      <tr>
                        <td>${frameNumber}</td>
                        <td>${startTime} - ${endTime}</td>
                        <td>${duration}</td>
                        <td>${possibleCause}</td>
                      </tr>
                    `
                  ).join('\n')
                }
              </tbody>
            </table>
            <blockquote><b>How to Read:</b> <i>Frame A, which occurs between B-C milliseconds (ms) in the benchmark, had a problematic duration of D. Command E in the benchmark may be causing this.</i></blockquote>
            </article>
            </main>
            <iframe 
              style="position: absolute; top: -9999em; visibility: hidden;"
              onload="this.style.position='static'; this.style.visibility='visible';"
              src='${`http://localhost:8833/?loadTimelineFromURL=http://localhost:4000/${data.name}/${data.name}.json`}'
            >
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
    if ([1].includes(difference)) {
      const group = _.last(result)
      group.push(value)
    } else {
      result.push([value])
    }
    return result
  }, [])(array)
)