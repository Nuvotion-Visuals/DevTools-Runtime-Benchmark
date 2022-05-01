const checkboxes = document.querySelectorAll('.benchmark')

const checked = new Array(checkboxes.length).fill(false)

checkboxes.forEach((checkbox, index) => {
  checkbox.addEventListener('change', event => {
    checked[index] = event.target.checked
  })
})

document.querySelector('#compare').addEventListener('click', event => {
  const activeIndicies = checked.reduce((a, e, i) => e ? a.concat(i) : a, [])
  const activeBenchmarks = activeIndicies.map(item => window.benchmarks[item])
  const activeBenchmarksJsonUrls = activeBenchmarks.map(name => `http://localhost:4000/${name}/${name}.json`)
  const activeBenchmarksInfoJsonUrls = activeBenchmarks.map(name => `http://localhost:4000/${name}/${name}-info.json`)

  let finalResult
  const urls = activeBenchmarksInfoJsonUrls

  if (activeBenchmarks.length === 0) {
    document.querySelector('#comparison').innerHTML = ''
    return
  }

  Promise.all(
    urls.map(url => fetch(url).then(e => e.json()))).then(data => {
      finalResult = data.flat()

      const renderCard = data => {
    
        return `
          <article>
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

            <h1>Score: ${data.score}</h1>

            <h4 style='padding-bottom: 0;'>FPS Percentiles</h4>
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

            <h4 style='padding-bottom: 0;'>Minimum FPS Percentages</h4>
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

            <h4 style='padding-bottom: 0;'>Performance Concerns</h4>
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
          </article>
        `
      }
    
      document.querySelector('#comparison').innerHTML = `
        <div class="grid" style="padding: 0 16px;">
          ${activeBenchmarks.map((name, index) => renderCard(finalResult[index])).join('')}
        </div>
        <iframe src='http://localhost:8833?loadTimelineFromURL=${activeBenchmarksJsonUrls.join(',')}'></iframe>
      `
    }
  )
})

document.querySelector('#startBenchmark').addEventListener('click', event => {
  fetch('/benchmark', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify({ 
      variation: document.querySelector('#variation').value,
      benchmarkName: document.querySelector('#selectBenchmark').value
    })
  }).then(res => {
    location.reload()
  })

  document.querySelector('#newBenchmark').innerHTML = `
    <label for='progress'>Performing Benchmark...</label>
    <progress id='loading'>Loading...<</progress>
  `
})

document.querySelector('#delete').addEventListener('click', event => {
  const activeIndicies = checked.reduce((a, e, i) => e ? a.concat(i) : a, [])
  const activeBenchmarks = activeIndicies.map(item => window.benchmarks[item])
  fetch('/benchmark', {
    method: 'DELETE',
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify({ activeBenchmarks })
  }).then(res => {
    location.reload()
  })
})