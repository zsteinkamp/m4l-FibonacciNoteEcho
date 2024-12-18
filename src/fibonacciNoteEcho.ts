autowatch = 1
inlets = 10
outlets = 4

function log(_: any) {
  for (let i = 0, len = arguments.length; i < len; i++) {
    const message = arguments[i]
    if (message && message.toString) {
      let s = message.toString()
      if (s.indexOf('[object ') >= 0) {
        s = JSON.stringify(message)
      }
      post(s)
    } else if (message === null) {
      post('<null>')
    } else {
      post(message)
    }
  }
  post('\n')
}

// inlet index -- used to identify an element in the
// 'options' array defined below
const INLET_NOTE = 0
const INLET_VELOCITY = 1
const INLET_TIME_BASE = 2
const INLET_TIMESCALE = 3
const INLET_ITERATIONS = 4
const INLET_DUR_BASE = 5
const INLET_DUR_DECAY = 6
const INLET_NOTE_INCR = 7
const INLET_VELOCITY_DECAY = 8
const INLET_SCALE_AWARE = 9

// the position in the options array corresponds to the inlet index
const options = [
  0, // INLET_NOTE
  0, // INLET_VELOCITY
  300, // INLET_TIME_BASE
  1, // INLET_TIMESCALE
  4, // INLET_ITERATIONS
  250, // INLET_DUR_BASE
  0.667, // INLET_DUR_DECAY
  0, // INLET_NOTE_INCR
  0.8, // INLET_VELOCITY_DECAY
  1, // INLET_SCALE_AWARE
]

type ScaleType = {
  notes: number[]
  watchers: {
    root: LiveAPI
    int: LiveAPI
    mode: LiveAPI
  }
}
const scale: ScaleType = {
  notes: [],
  watchers: {
    root: null,
    int: null,
    mode: null,
  },
}

// outlets
const OUTLET_NOTE = 0
const OUTLET_VELOCITY = 1
const OUTLET_DURATION = 2
const OUTLET_JSUI = 3

let pattern: Step[] = []

function init() {
  if (!scale.watchers.root) {
    scale.watchers.root = new LiveAPI(updateScales, 'live_set')
    scale.watchers.root.property = 'root_note'

    scale.watchers.int = new LiveAPI(updateScales, 'live_set')
    scale.watchers.int.property = 'scale_intervals'

    scale.watchers.mode = new LiveAPI(updateScales, 'live_set')
    scale.watchers.mode.property = 'scale_mode'
  }
}

function updateScales() {
  if (!scale.watchers.root) {
    //log('early')
    return
  }
  const api = new LiveAPI(() => {}, 'live_set')
  const root = api.get('root_note')
  const intervals = api.get('scale_intervals')
  scale.notes = []

  let root_note = root - 12
  let note = root_note

  while (note <= 127) {
    for (const interval of intervals) {
      note = root_note + interval
      if (note >= 0 && note <= 127) {
        scale.notes.push(note)
      }
    }
    root_note += 12
    note = root_note
  }
  //log(
  //  'ROOT=' +
  //    root +
  //    ' INT=' +
  //    intervals +
  //    ' MODE=' +
  //    state.scale_mode +
  //    ' NAME=' +
  //    state.scale_name +
  //    ' AWARE=' +
  //    state.scale_aware +
  //    ' NOTES=' +
  //    state.scale_notes
  //)
}

// Method to calculate the Fibonacci pattern for the current knob values.
function setupPattern() {
  //log(options);
  pattern = []

  if (options[INLET_SCALE_AWARE]) {
    updateScales()
  }

  // first note plays immediately
  pattern.push({
    note_incr: 0,
    fib: 0,
    velocity_coeff: 1,
    duration: options[INLET_DUR_BASE],
    time_offset: 0,
  })

  let prv = 1
  let fib = 1
  let tmp
  let prv_time_offset = 0
  let new_time_offset = 0

  for (let i = 1; i < options[INLET_ITERATIONS]; i++) {
    //log(fib);
    new_time_offset =
      prv_time_offset +
      options[INLET_TIMESCALE] * options[INLET_TIME_BASE] * fib

    pattern.push({
      note_incr: i * options[INLET_NOTE_INCR],
      fib,
      velocity_coeff: Math.pow(options[INLET_VELOCITY_DECAY], i),
      duration: options[INLET_DUR_BASE] * Math.pow(options[INLET_DUR_DECAY], i),
      time_offset: new_time_offset,
    })
    tmp = fib
    fib = fib + prv
    prv = tmp
    prv_time_offset = new_time_offset
  }
  //log(pattern);

  // Pass 'update' as the head of the array sent to the JSUI outlet calls the
  // 'update' method in the jsui object with the rest of the pattern array as
  // js args. This results in the visualization being redrawn.
  outlet(OUTLET_JSUI, ['update', ...pattern])
}

// Returns a function that when executed will send a note of a given pitch,
// velocity, and duration to the outlets.
function makeTask(i: number, p: Step, n: number, v: number) {
  //log('MAKE_TASK scale_aware=' + options[INLET_SCALE_AWARE])
  return function () {
    if (options[INLET_SCALE_AWARE]) {
      // get base note, look up
      const baseIdx = scale.notes.indexOf(n)
      const newIdx = baseIdx + p.note_incr
      n = scale.notes[newIdx]
      //log('NOTE: ' + n + ' base:' + baseIdx + ' new:' + newIdx)
      if (!n) {
        // invalid note
        return
      }
    } else {
      n = n + p.note_incr
    }
    v = Math.floor(v * p.velocity_coeff)
    const d = p.duration

    //log({
    //  i: i,
    //  n: n,
    //  v: v,
    //  d: d,
    //});

    outlet(OUTLET_JSUI, 'flash', i.toString())
    outlet(OUTLET_DURATION, d)
    outlet(OUTLET_VELOCITY, v)
    outlet(OUTLET_NOTE, n)
  }
}

function msg_int(value: number) {
  // integer value received
  handleMessage(value)
}
function msg_float(value: number) {
  // float value received
  handleMessage(value)
}

// called by msg_* methods above when any input is received, e.g. when a knob value changes
function handleMessage(value: number) {
  // 'inlet' is set by M4L and corresponds to the inlet number the last message
  // was received on.
  options[inlet] = value

  // The first two inlets are INLET_NOTE and INLET_VELOCITY, so we do not need to recalculate
  // the pattern when a message is received on one of those ... only for higher numbered inlets.
  if (inlet > INLET_VELOCITY) {
    setupPattern()
  }

  if (inlet === INLET_NOTE && options[INLET_VELOCITY] > 0) {
    // note received
    if (options[INLET_SCALE_AWARE]) {
      // adjust note to scale if scale_aware is set
      let noteNum = options[INLET_NOTE]
      let scaleIdx = scale.notes.indexOf(noteNum)

      while (scaleIdx < 0 && noteNum > 0) {
        noteNum -= 1
        scaleIdx = scale.notes.indexOf(noteNum)
      }
      options[INLET_NOTE] = noteNum
    }
    for (let idx = 0; idx < pattern.length; idx++) {
      // Schedule a note-playing task to execute for each element in the
      // pattern, at time_offset in the future.
      // The first element is time_offset === 0.
      const t = new Task(
        makeTask(
          idx,
          pattern[idx],
          options[INLET_NOTE],
          options[INLET_VELOCITY]
        )
      )
      t.schedule(pattern[idx].time_offset)
    }
  }
}
