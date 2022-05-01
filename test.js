const fs = require('fs')

const trace = JSON.parse(fs.readFileSync(`benchmark-result/benchmark_AddScene_2022-4-6-23-2-22/benchmark_AddScene_2022-4-6-23-2-22.json`, 'utf8'))

const percentile = require("percentile");
const traceEvents = trace?.traceEvents

const frames = traceEvents.filter(event => event.name === 'BeginMainThreadFrame')

    const frameTimes = frames.map((frame, index) => 
      frames?.[index - 1]
        ? (frame.ts * .001).toFixed(0) - (frames?.[index - 1].ts * .001).toFixed(0)
        : 0
    )

    const timestampedFrameTimes = frames.map((frame, index) => {
      const duration = frames?.[index - 1]
        ? (frame.ts * .001).toFixed(0) - (frames?.[index - 1].ts * .001).toFixed(0)
        : 0

      const startTime = (frames?.[index - 1]?.ts * .001)
      const endTime = (frame.ts * .001)

      return {
        startTime,
        endTime,
        duration
      }
    })

    console.log(timestampedFrameTimes)