/* jshint browser: true, esversion: 8, laxcomma: true, laxbreak: true */
import { ShellController } from './shell.mjs';
import { MainUIController, Layouts, LAYOUT_GROUPS } from './components/main-ui.mjs';


// Should not require to wait until load (all resources, images etc are loaded),
// so this would make it much quicker at startup.
function main() {
    // ensures the document is ready and can be queried
    // let mainUIElement = document.querySelector('.typeroof-ui_main');
    shellCtrl.setInitialDependency('ready', true);
}
const shellCtrl = new ShellController(window, { MainUIController, Layouts, LAYOUT_GROUPS });

if(document.readyState === 'loading')
    window.addEventListener('DOMContentLoaded', main);
else
    main();
