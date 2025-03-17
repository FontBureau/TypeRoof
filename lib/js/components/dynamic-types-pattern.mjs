
import {
    deCamelize
} from '../util.mjs';

import {
   _AbstractStructModel
  , _AbstractOrderedMapModel
  , _AbstractDynamicStructModel
  , _AbstractGenericModel
  , ForeignKey
  , ValueLink
  , StaticDependency
  , InternalizedDependency
  , StringModel
  , createAvailableTypes
  , createDynamicType
  , SERIALIZE_OPTIONS
  , SERIALIZE_FORMAT_OBJECT
  , deserializeSync
} from '../metamodel.mjs';

            // => .value will any a concrete _BaseModel
            // it would be good to check these.
export const GenericTypeModel = _AbstractGenericModel.createClass('GenericTypeModel')
  , AvailableTypeModel = _AbstractStructModel.createClass(
        'AvailableTypeModel'
      , ['label', StringModel]
      , ['typeClass', GenericTypeModel]
    )
  , AvailableTypesModel = _AbstractOrderedMapModel.createClass('AvailableTypesModel', AvailableTypeModel)
  ;


export function createGenericAvailableTypes(staticTypes) {
    return createAvailableTypes(AvailableTypesModel, staticTypes);
}

export function createDynamicModel(name, staticTypes=null, moreMixin=[], moreDependencies=[]) {
    const UCFirstName = name[0].toUpperCase() + name.slice(1)
      , LCFirstName  = name[0].toLowerCase() + name.slice(1)
      , UCSnakeCaseName = deCamelize(name).toUpperCase()
      , typeToTypeKeyName = `${UCSnakeCaseName}_TYPE_TO_${UCSnakeCaseName}_TYPE_KEY`
      , availabaleTypesName = `available${UCFirstName}Types`
      , modelName = `${UCFirstName}Model`
      , typeKeyName = `${LCFirstName}TypeKey`
      , modelValueName = `${LCFirstName}Model`
      , dynamicStructModelName = `Dynamic${modelName}`
      , result = {}
      , mixinAvailableTypes = []
      ;

    if(staticTypes !== null) {
        [result[availabaleTypesName] , result[typeToTypeKeyName]] = createGenericAvailableTypes(staticTypes);
        const availableTypes = result[availabaleTypesName]
        mixinAvailableTypes.push(...StaticDependency.createWithInternalizedDependency(
                        availabaleTypesName
                      , AvailableTypesModel
                      , availableTypes
                      ));
    }
    else {
        // Not as a static dependency ...
        // This way a parent cant define the StaticDependency,
        // which means the model can contain instances of itself.
        mixinAvailableTypes.push(
            [availabaleTypesName, new InternalizedDependency(availabaleTypesName, AvailableTypesModel)]
        );
    }
    result[modelName] = _AbstractStructModel.createClass(
        modelName
      , ...mixinAvailableTypes
      , [typeKeyName, new ForeignKey(availabaleTypesName, ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
      , [modelValueName , new ValueLink(typeKeyName)]
      , ['instance', _AbstractDynamicStructModel.createClass(dynamicStructModelName
                            , availabaleTypesName
                            , modelValueName // this becomes a special dependency name
                            // This is a bit of a pain point, however, we
                            // can't collect these dependencies dynamically yet:
                            , [availabaleTypesName, ...moreDependencies])]
      , ...moreMixin
    );
    const Model = result[modelName];

    result[`create${UCFirstName}`] = function(typeKey, dependencies) {
        return createDynamicType(Model, typeKeyName, typeKey, dependencies);
    }
    result[`deserialize${modelName}`] = function(dependencies, data) {
        const serializeOptions = Object.assign({}, SERIALIZE_OPTIONS, {format: SERIALIZE_FORMAT_OBJECT})
        return deserializeSync(Model, dependencies, data, serializeOptions);
    }
    return result;
}

