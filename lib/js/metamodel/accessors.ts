import { _BaseContainerModel } from './base-model.ts';
import { _NOTDEF } from './util.ts';
import { Path } from './path.ts';

export const IS_CONTAINER = Symbol("IS_CONTAINER");
export function* getAllPathsAndValues(state) {
    // This check should rather be "is a container type"
    // and that would mean it has entries and it has a
    // get function that returns values for keys...
    if (state instanceof _BaseContainerModel) {
        // yield [IS_CONTAINER];
        if (!state.allEntries)
            console.warn(`!state.allEntries ${state}`, state);
        for (const [key, entry] of state.allEntries())
            for (const [value, ...path] of getAllPathsAndValues(entry))
                yield [value, key, ...path];
    } else yield [state];
}

export function _getEntry(fnName, state, path, defaultVal = _NOTDEF) {
    const pathInstance =
        typeof path === "string" ? Path.fromString(path) : path;
    try {
        const result = [...pathInstance.parts].reduce((accum, part) => {
            if (!(accum instanceof _BaseContainerModel))
                throw new Error(
                    `CONTAINER ENTRY ERROR no container at ${part} in ${accum} path: ${pathInstance.toString()}.`,
                );
            return accum[fnName](part);
        }, state);
        return result;
    } catch (error) {
        // Could check if error is not a KEY ERROR type, but e don't!
        if (defaultVal !== _NOTDEF) return defaultVal;
        error.message += ` (path: ${path});`;
        throw error;
    }
}

export function getDraftEntry(state, path, defaultVal = _NOTDEF) {
    return _getEntry("getDraftFor", state, path, defaultVal);
}

export function getEntry(state, path, defaultVal = _NOTDEF) {
    return _getEntry("get", state, path, defaultVal);
}

export function getValue(state, path, defaultVal = _NOTDEF) {
    const result = getEntry(state, path, defaultVal);
    return result === defaultVal ? result : result.value;
}

// How does changing the font trickle down to an updated axisLocations state!
// it seems that some knowledge about the font (READ ONLY) must be in some
// lower model.
// AND:

export function* _getAllEntries(state, path) {
    const pathInstance =
        typeof path === "string" ? Path.fromString(path) : path;
    let current = state;
    yield current; // for the empty path
    for (const pathPart of pathInstance) {
        current = getEntry(current, pathPart);
        yield current;
    }
}

// FIXME: would be cool to be able to get the Model of
// Links.
export function getModel(RootModel, path) {
    const pathInstance =
        typeof path === "string" ? Path.fromString(path) : path;
    return pathInstance.parts.reduce((accum, key) => {
        console.log("getModel:", key, "from:", accum);
        if ("Model" in accum)
            // We don't use key here, because this is a Map/List
            // and the key is just a placeholder, the Model is equal
            // for each element.
            return accum.Model;
        if ("fields" in accum) return accum.fields.get(key);
        throw new Error(
            `KEY ERROR don't know how to get model from ${accum.name}`,
        );
    }, RootModel);
}

export function applyTo(state, path, methodNameOrFn, ...args) {
    const pathInstance =
            typeof path === "string" ? Path.fromString(path) : path,
        entry = getEntry(state, pathInstance);
    // should probably store ForeignKeys still as BaseModel!
    console.log(
        `... at path ${path} applyEntry ${entry} method ${methodNameOrFn}:`,
        ...args,
    );
    // how to change a non-container entry? => There's a set(value) method.
    // it basically has no methods to change!
    if (typeof methodNameOrFn === "function")
        return methodNameOrFn(entry, ...args);
    else return entry[methodNameOrFn](...args);
}

export function pushEntry(state, path, ...entries) {
    return applyTo(state, path, "push", ...entries);
}

export function popEntry(state, path) {
    return applyTo(state, path, "pop");
}

export function spliceEntry(state, path, start, deleteCount, ...items) {
    return applyTo(state, path, "splice", start, deleteCount, items);
}

export function deleteEntry(state, path, key) {
    return applyTo(state, path, "delete", key);
}
