//
//  Copyright Pentrek Inc, 2022
//

function _ptrk_drag_enter(e) {
    e.stopPropagation();
    e.preventDefault();
}
function _ptrk_drag_over(e) {
    e.stopPropagation();
    e.preventDefault();
}

function _ptrk_drag_drop(e, file_handler) {
    e.stopPropagation();
    e.preventDefault();
    const files = e.dataTransfer.files;
    console.log('dropping', files.length, 'files');
    if (files.length > 0) {
        file_handler(files[0]);
    }
}

//
// Installs drag&drop on an element: handler(file)
//
export function ptrk_install_drag_drop(elem, handler) {
   elem.addEventListener('dragenter', _ptrk_drag_enter, false);
   elem.addEventListener('dragover',  _ptrk_drag_over, false);
   elem.addEventListener('drop', (evt) => {
       _ptrk_drag_drop(evt, handler);
   }, false);
}

//
// Converts a file into a binary array: handler(file_name, array_buffer)
//
export function ptrk_read_file_into_array(file, handler) {
    let reader = new FileReader();
    reader.onload = function() {
        handler(file.name, reader.result);
    };
    reader.readAsArrayBuffer(file);
}
