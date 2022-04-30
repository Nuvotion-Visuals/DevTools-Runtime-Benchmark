const fs = require('fs')
const cors = require('cors');
const { spawn } = require('child_process');
const express = require('express')
const app = express()
const port = process.env.PORT || 4000

app.use(cors())
app.options('*', cors())
app.use(express.json());
app.use(express.static(__dirname + '/benchmark-result'))
app.listen(port)

app.post('/benchmark', function (req, res, next) {
  console.log('Got variation:', req.body.variation);
  const dir = spawn( 'node', [ 'benchmark.js', `"${req.body.variation}"`], { shell: true } );
  dir.stdout.on( 'data', ( data ) => console.log( `stdout: ${ data }` ) );
  dir.stderr.on( 'data', ( data ) => console.log( `stderr: ${ data }` ) );
  dir.on( 'close', ( code ) => {
    console.log( `child process exited with code ${code}`) 
    if (code === 0) {
      res.sendStatus(200);
    }
  })
})

app.get('/', function (req, res, next) {

  const directories = fs.readdirSync(__dirname + '\\benchmark-result\\', { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

  const benchmarkInfo = {}

  directories.forEach((directory, index) => {
    benchmarkInfo[index] = JSON.parse(fs.readFileSync(`benchmark-result/${directory}/${directory}-info.json`, 'utf8'))
  })

  res.end(`
    <!doctype html>
      <html>
      <head>
        <title>DevTools Runtime Benchmark</title>
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
          :root {
            --primary: #c00c00;
          }
        </style>
      </head>
      <body class="amp-dark-mode">
      
        <nav>
          <ul></ul>
          <ul>
            <li><a href="/"><h1>DevTools Runtime Benchmark</h1></a></li>
          </ul>
          <ul></ul>
        </nav>

        <table role="grid">
          <thead>
            <tr>
              <th scope="col" width="36px"><a href="#" role="button" id='compare'>Compare</a></th>
              <th scope="col" width="36px" ><b>Index</b></th>
              <th scope="col" width="200px"><b>Date</b></th>
              <th scope="col" width="300px"><b>Benchmark Name</b></th>
              <th scope="col"><b>Variation</b></col>
            </tr>
          </thead>
          <tbody>
            ${
              directories.map((directory, index) => {
                const info = directory.split('_')

                const { 
                  benchmarkName,
                  variation,
                  duration
                } = benchmarkInfo[index]

                return `
                  <tr>
                    <td style='text-align:center; vertical-align:middle'><input type="checkbox" class="benchmark"/></td>
                    <td style='text-align:center; vertical-align:middle'>${index}</td>
                    <td><a href='http://localhost:4000/${directory}/${directory}.html'>${info[2]}</a></td>
                    <td>${benchmarkName}</td>
                    <td>${variation}</td>
                  </tr>
                `
              }).join('\n')
            }
          </tbody>
        </table>
        <div id='comparison'>
        </div>

        <div class="container">
        <article id='newBenchmark'>
          <h4>Perform a New Benchmark</h4>
          <label for='selectBenchmark'>Benchmark</label>

          <select id="selectBenchmark">
            <option selected>AddScene</option>
          </select>

          <label for='variation'>Variation</label>
          <input type='text' id='variation' placeholder='Describe the variation in this benchmark' />

          <button id='startBenchmark'>Start Benchmark</button>
          </article>
        </div>

        
      </body>
      <script>
        const str = '${directories.join(',')}'
        window.benchmarks = str.split(',');
      </script>
      <script src="./report-server-script.js" async></script>
      
    </html>
  `)
})