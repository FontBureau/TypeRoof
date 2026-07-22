import {
    FreezableMap
} from '../../metamodel.mjs';

// import {
//     CompareLineTaskAutomationDialog
// } from '../task-automations/compare-line.mjs';

import {
    SimpleClockTaskAutomationDialog
} from './simple-clock.mjs';

import {
    InchwormTaskAutomationDialog
} from './inchworm.mjs';

export const CONTAINER_TASK_AUTOMATIONS = Object.freeze(new FreezableMap([
   // ['comparison', ['Compar-A-Line', CompareLineTaskAutomationDialog]]
    ['clock', ['Simple Clock', SimpleClockTaskAutomationDialog]]
  , ['inchworm', ['The Inchworm', InchwormTaskAutomationDialog]]
]));
