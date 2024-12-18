var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
autowatch = 1;
inlets = 10;
outlets = 4;
function log(_) {
    for (var i = 0, len = arguments.length; i < len; i++) {
        var message = arguments[i];
        if (message && message.toString) {
            var s = message.toString();
            if (s.indexOf('[object ') >= 0) {
                s = JSON.stringify(message);
            }
            post(s);
        }
        else if (message === null) {
            post('<null>');
        }
        else {
            post(message);
        }
    }
    post('\n');
}
// inlet index -- used to identify an element in the
// 'options' array defined below
var INLET_NOTE = 0;
var INLET_VELOCITY = 1;
var INLET_TIME_BASE = 2;
var INLET_TIMESCALE = 3;
var INLET_ITERATIONS = 4;
var INLET_DUR_BASE = 5;
var INLET_DUR_DECAY = 6;
var INLET_NOTE_INCR = 7;
var INLET_VELOCITY_DECAY = 8;
var INLET_SCALE_AWARE = 9;
// the position in the options array corresponds to the inlet index
var options = [
    0,
    0,
    300,
    1,
    4,
    250,
    0.667,
    0,
    0.8,
    1, // INLET_SCALE_AWARE
];
var scale = {
    notes: [],
    watchers: {
        root: null,
        int: null,
        mode: null
    }
};
// outlets
var OUTLET_NOTE = 0;
var OUTLET_VELOCITY = 1;
var OUTLET_DURATION = 2;
var OUTLET_JSUI = 3;
var pattern = [];
function init() {
    if (!scale.watchers.root) {
        scale.watchers.root = new LiveAPI(updateScales, 'live_set');
        scale.watchers.root.property = 'root_note';
        scale.watchers.int = new LiveAPI(updateScales, 'live_set');
        scale.watchers.int.property = 'scale_intervals';
        scale.watchers.mode = new LiveAPI(updateScales, 'live_set');
        scale.watchers.mode.property = 'scale_mode';
    }
}
function updateScales() {
    if (!scale.watchers.root) {
        //log('early')
        return;
    }
    var api = new LiveAPI(function () { }, 'live_set');
    var root = api.get('root_note');
    var intervals = api.get('scale_intervals');
    scale.notes = [];
    var root_note = root - 12;
    var note = root_note;
    while (note <= 127) {
        for (var _i = 0, intervals_1 = intervals; _i < intervals_1.length; _i++) {
            var interval = intervals_1[_i];
            note = root_note + interval;
            if (note >= 0 && note <= 127) {
                scale.notes.push(note);
            }
        }
        root_note += 12;
        note = root_note;
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
    pattern = [];
    if (options[INLET_SCALE_AWARE]) {
        updateScales();
    }
    // first note plays immediately
    pattern.push({
        note_incr: 0,
        fib: 0,
        velocity_coeff: 1,
        duration: options[INLET_DUR_BASE],
        time_offset: 0
    });
    var prv = 1;
    var fib = 1;
    var tmp;
    var prv_time_offset = 0;
    var new_time_offset = 0;
    for (var i = 1; i < options[INLET_ITERATIONS]; i++) {
        //log(fib);
        new_time_offset =
            prv_time_offset +
                options[INLET_TIMESCALE] * options[INLET_TIME_BASE] * fib;
        pattern.push({
            note_incr: i * options[INLET_NOTE_INCR],
            fib: fib,
            velocity_coeff: Math.pow(options[INLET_VELOCITY_DECAY], i),
            duration: options[INLET_DUR_BASE] * Math.pow(options[INLET_DUR_DECAY], i),
            time_offset: new_time_offset
        });
        tmp = fib;
        fib = fib + prv;
        prv = tmp;
        prv_time_offset = new_time_offset;
    }
    //log(pattern);
    // Pass 'update' as the head of the array sent to the JSUI outlet calls the
    // 'update' method in the jsui object with the rest of the pattern array as
    // js args. This results in the visualization being redrawn.
    outlet(OUTLET_JSUI, __spreadArray(['update'], pattern, true));
}
// Returns a function that when executed will send a note of a given pitch,
// velocity, and duration to the outlets.
function makeTask(i, p, n, v) {
    //log('MAKE_TASK scale_aware=' + options[INLET_SCALE_AWARE])
    return function () {
        if (options[INLET_SCALE_AWARE]) {
            // get base note, look up
            var baseIdx = scale.notes.indexOf(n);
            var newIdx = baseIdx + p.note_incr;
            n = scale.notes[newIdx];
            //log('NOTE: ' + n + ' base:' + baseIdx + ' new:' + newIdx)
            if (!n) {
                // invalid note
                return;
            }
        }
        else {
            n = n + p.note_incr;
        }
        v = Math.floor(v * p.velocity_coeff);
        var d = p.duration;
        //log({
        //  i: i,
        //  n: n,
        //  v: v,
        //  d: d,
        //});
        outlet(OUTLET_JSUI, 'flash', i.toString());
        outlet(OUTLET_DURATION, d);
        outlet(OUTLET_VELOCITY, v);
        outlet(OUTLET_NOTE, n);
    };
}
function msg_int(value) {
    // integer value received
    handleMessage(value);
}
function msg_float(value) {
    // float value received
    handleMessage(value);
}
// called by msg_* methods above when any input is received, e.g. when a knob value changes
function handleMessage(value) {
    // 'inlet' is set by M4L and corresponds to the inlet number the last message
    // was received on.
    options[inlet] = value;
    // The first two inlets are INLET_NOTE and INLET_VELOCITY, so we do not need to recalculate
    // the pattern when a message is received on one of those ... only for higher numbered inlets.
    if (inlet > INLET_VELOCITY) {
        setupPattern();
    }
    if (inlet === INLET_NOTE && options[INLET_VELOCITY] > 0) {
        // note received
        if (options[INLET_SCALE_AWARE]) {
            // adjust note to scale if scale_aware is set
            var noteNum = options[INLET_NOTE];
            var scaleIdx = scale.notes.indexOf(noteNum);
            while (scaleIdx < 0 && noteNum > 0) {
                noteNum -= 1;
                scaleIdx = scale.notes.indexOf(noteNum);
            }
            options[INLET_NOTE] = noteNum;
        }
        for (var idx = 0; idx < pattern.length; idx++) {
            // Schedule a note-playing task to execute for each element in the
            // pattern, at time_offset in the future.
            // The first element is time_offset === 0.
            var t = new Task(makeTask(idx, pattern[idx], options[INLET_NOTE], options[INLET_VELOCITY]));
            t.schedule(pattern[idx].time_offset);
        }
    }
}
