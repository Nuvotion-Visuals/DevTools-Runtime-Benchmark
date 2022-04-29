const fs = require('fs')
const cors = require('cors');
const express = require('express')
const app = express()
const port = process.env.PORT || 4000

app.use(cors())
app.options('*', cors())
app.use(express.static(__dirname + '/benchmark-result'))
app.listen(port)

app.get('/', function (req, res, next) {

  const directories = fs.readdirSync(__dirname + '\\benchmark-result\\', { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

  console.log(directories)

  res.end(`
    <!doctype html>
      <html>
      <head>
        <title>Benchmark Report Viewer</title>
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
      <body class="amp-dark-mode">
      
        <nav>
          <ul></ul>
          <ul>
            <li><h1>Benchmark Report Viewer</h1></li>
          </ul>
          <ul></ul>
        </nav>
        <table role="grid">
          <thead>
            <tr>
              <th scope="col" width="36px"></th>
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
                return `
                  <tr>
                    <td style='text-align:center; vertical-align:middle'><input type="checkbox" /></td>
                    <td style='text-align:center; vertical-align:middle'>${index}</td>
                    <td><a href='http://localhost:4000/${directory}/${directory}.html'>${info[2]}</a></td>
                    <td>${info[1]}</td>
                    <td>Variation</td>
                  </tr>
                `
              }).join('\n')
            }
          </tbody>
        </table>
      </body>
    </html>
  `)
})