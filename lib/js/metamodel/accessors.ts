import { _BaseModel, _BaseContainerModel } from "./base-model.ts";
import { _NOTDEF } from "./util.ts";
import { Path } from "./path.ts";

export const IS_CONTAINER = Symbol("IS_CONTAINER");
export function* getAllPathsAndValues(
    state: _BaseModel,
): Generator<[_BaseModel, ...string[]]> {
    // This check should rather be "is a container type"
    // and that would mean it has entries and it has a
    // get function that returns values for keys...
    if (state instanceof _BaseContainerModel) {
        for (const [key, entry] of state.allEntries())
            for (const [value, ...path] of getAllPathsAndValues(entry))
                yield [value, key, ...path];
    } else yield [state];
}

type ContainerAccessor = "get" | "getDraftFor";

function _getEntry(
    fnName: ContainerAccessor,
    state: _BaseModel,
    path: string | Path,
    defaultVal: unknown = _NOTDEF,
): _BaseModel | unknown {
    const pathInstance =
        typeof path === "string" ? Path.fromString(path) : path;
    try {
        return [...pathInstance.parts].reduce(
            (accum: _BaseModel, part: string) => {
                if (!(accum instanceof _BaseContainerModel))
                    throw new Error(
                        `CONTAINER ENTRY ERROR no container at ${part} in ${accum} path: ${pathInstance.toString()}.`,
                    );
                const fn = (
                    accum as unknown as Record<
                        string,
                        ((key: string) => unknown) | undefined
                    >
                )[fnName];
                if (!fn)
                    throw new Error(
                        `VALUE ERROR container has no method "${fnName}" at "${part}" in path: ${pathInstance.toString()}.`,
                    );
                return fn.call(accum, part) as _BaseModel;
            },
            state,
        );
    } catch (error) {
        // Could check if error is not a KEY ERROR type, but we don't!
        if (defaultVal !== _NOTDEF) return defaultVal;
        (error as Error).message += ` (path: ${path});`;
        throw error;
    }
}

export function getDraftEntry(
    state: _BaseModel,
    path: string | Path,
): _BaseModel;
export function getDraftEntry<D>(
    state: _BaseModel,
    path: string | Path,
    defaultVal: D,
): _BaseModel | D;
export function getDraftEntry(
    state: _BaseModel,
    path: string | Path,
    defaultVal: unknown = _NOTDEF,
): _BaseModel | unknown {
    return _getEntry("getDraftFor", state, path, defaultVal);
}

export function getEntry(state: _BaseModel, path: string | Path): _BaseModel;
export function getEntry<D>(
    state: _BaseModel,
    path: string | Path,
    defaultVal: D,
): _BaseModel | D;
export function getEntry(
    state: _BaseModel,
    path: string | Path,
    defaultVal: unknown = _NOTDEF,
): _BaseModel | unknown {
    return _getEntry("get", state, path, defaultVal);
}

export function getValue(
    state: _BaseModel,
    path: string | Path,
    defaultVal: unknown = _NOTDEF,
): unknown {
    const result = getEntry(state, path, defaultVal);
    return result === defaultVal
        ? result
        : (result as _BaseModel & { value: unknown }).value;
}

// How does changing the font trickle down to an updated axisLocations state!
// it seems that some knowledge about the font (READ ONLY) must be in some
// lower model.
// AND:

export function* _getAllEntries(
    state: _BaseModel,
    path: string | Path,
): Generator<_BaseModel> {
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
export function getModel(
    RootModel: typeof _BaseModel,
    path: string | Path,
): typeof _BaseModel {
    const pathInstance =
        typeof path === "string" ? Path.fromString(path) : path;
    // Accumulator traverses static class properties (Model, fields) which
    // are not in _BaseModel's type surface — use Record<string, unknown>.
    const result = pathInstance.parts.reduce(
        (accum: Record<string, unknown>, key: string) => {
            console.log("getModel:", key, "from:", accum);
            if ("Model" in accum)
                // We don't use key here, because this is a Map/List
                // and the key is just a placeholder, the Model is equal
                // for each element.
                return accum.Model as Record<string, unknown>;
            if ("fields" in accum)
                return (accum.fields as Map<string, unknown>).get(
                    key,
                ) as Record<string, unknown>;
            throw new Error(
                `KEY ERROR don't know how to get model from ${accum.name}`,
            );
        },
        RootModel as unknown as Record<string, unknown>,
    );
    return result as unknown as typeof _BaseModel;
}

export function applyTo(
    state: _BaseModel,
    path: string | Path,
    methodNameOrFn:
        | string
        | ((entry: _BaseModel, ...args: unknown[]) => unknown),
    ...args: unknown[]
): unknown {
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
    else {
        const method = (
            entry as unknown as Record<
                string,
                ((...a: unknown[]) => unknown) | undefined
            >
        )[methodNameOrFn];
        if (!method)
            throw new Error(
                `VALUE ERROR entry has no method "${methodNameOrFn}" at path: ${pathInstance.toString()}.`,
            );
        return method.call(entry, ...args);
    }
}

export function pushEntry(
    state: _BaseModel,
    path: string | Path,
    ...entries: unknown[]
): unknown {
    return applyTo(state, path, "push", ...entries);
}

export function popEntry(state: _BaseModel, path: string | Path): unknown {
    return applyTo(state, path, "pop");
}

export function spliceEntry(
    state: _BaseModel,
    path: string | Path,
    start: number,
    deleteCount: number,
    ...items: unknown[]
): unknown {
    return applyTo(state, path, "splice", start, deleteCount, items);
}

export function deleteEntry(
    state: _BaseModel,
    path: string | Path,
    key: string,
): unknown {
    return applyTo(state, path, "delete", key);
}
