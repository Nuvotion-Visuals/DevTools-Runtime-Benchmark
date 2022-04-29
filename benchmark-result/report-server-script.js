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
  document.querySelector('#comparison').innerHTML = ''
  if (activeBenchmarks.length > 0) {
    document.querySelector('#comparison').innerHTML = `
      <p>Comparing ${ activeBenchmarks.map(benchmark => benchmark.split('_')[2]).join(', ') }</p>
      <iframe src='http://localhost:8833?loadTimelineFromURL=${activeBenchmarksJsonUrls.join(',')}'></iframe>
    `
  }
})

document.querySelector('#startBenchmark').addEventListener('click', event => {
  fetch('/benchmark', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify({ variation: document.querySelector('#variation').value })
  }).then(res => {
    document.querySelector('#newBenchmark').innerHTML = `
      <dialog open>
        <article>
          <h3>Benchmark Completed</h3>
          <p>
            The benchmark was successful. Either refresh the list of benchmarks, or view the new report.
          </p>
          <footer>
            <a href="/" role="button" class="secondary">Refresh List</a>
            <a href="/" role="button">View report</a>
          </footer>
        </article>
      </dialog>
    `
  })

  document.querySelector('#newBenchmark').innerHTML = `
    <label for='progress'>Performing Benchmark...</label>
    <progress id='loading'>Loading...<</progress>
  `
})