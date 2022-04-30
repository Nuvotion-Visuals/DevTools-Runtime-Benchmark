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

      console.log(finalResult)

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
    body: JSON.stringify({ variation: document.querySelector('#variation').value })
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