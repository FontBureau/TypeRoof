/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */

// Return the color32 as a hex string with a leading '#' -- for css
function ptrk_util_color32_to_string(c) {
    // color32 is argb, but the css color string wants rgba, so we rotate
    c = ((c & 0x00FFFFFF) << 8) | ((c >> 24) & 0xFF);
    // need leading zeros for our 8 hex, so add this and then just look
    // at the last 8 digits
    c += 0x100000000;
    return '#' + c.toString(16).substr(-8);

}

function ptrk_path_fill_rule(filltype) {
    return filltype == 0 ? "nonzero" : "evenodd";
}

function ptrk_path_make(ptsptr, npts, vbsptr, nvbs) {
    const pts = new Float32Array(Module.HEAPF32.buffer, ptsptr, npts*2);
    const vbs = new Uint8Array(Module.HEAPU8.buffer, vbsptr, nvbs);

    const path = new Path2D();

    let index = 0;
    for (let i = 0; i < nvbs; ++i) {
        switch (vbs[i]) {
            case 0:
                path.moveTo(pts[index+0], pts[index+1]);
                index += 2;
                break;
            case 1:
                path.lineTo(pts[index+0], pts[index+1]);
                index += 2;
                break;
            case 2:
                path.quadraticCurveTo(pts[index+0], pts[index+1],
                                      pts[index+2], pts[index+3]);
                index += 4;
                break;
            case 3:
                path.bezierCurveTo(pts[index+0], pts[index+1],
                                   pts[index+2], pts[index+3],
                                   pts[index+4], pts[index+5]);
                index += 6;
                break;
            case 4:
                path.closePath();
                break;
            default:
                console.log('UNEXPECTED VERB ' + vbs[i]);
                break;
        }
    }
    return path;
}
