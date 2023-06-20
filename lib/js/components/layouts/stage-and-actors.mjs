/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
import {
  //   Path
  // , getEntry
  // , ForeignKey
  // , unwrapPotentialWriteProxy
  // , StateComparison
  // , CoherenceFunction
  // , BooleanModel
  // , StringModel
  // , NumberModel
  // , ValueLink
  // , InternalizedDependency
  // , _AbstractStructModel
  // , _AbstractListModel
  // , _AbstractSimpleOrEmptyModel
  // , FreezableMap
} from '../../metamodel.mjs';

import {
    _BaseContainerComponent
} from '../basics.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

const StageAndActorsModel = _BaseLayoutModel.createClass(
        'StageAndActorsModel'
    )
  ;

class StageAndActorsController extends _BaseContainerComponent {
    constructor(parentAPI, zones) {
        const widgets = [
        ];
        super(parentAPI, zones, widgets);
    }
}


export {
    StageAndActorsModel as Model
  , StageAndActorsController as Controller
};
