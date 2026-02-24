import { PATH_SEPARATOR } from "./util.ts";

export class Path {
    // jshint ignore: start
    static SEPARATOR = PATH_SEPARATOR;
    static RELATIVE = ".";
    static ROOT = "/";
    static PARENT = "..";
    // jshint ignore: end

    declare readonly parts: readonly string[];
    declare readonly explicitAnchoring: string | null;
    declare readonly isExplicitlyRelative: boolean;
    declare readonly isExplicitlyAbsolute: boolean;

    /* Without actually knowing the model structure, the save
     * way to do this is to remove single dot path parts and
     * reduce consecutive slashes into single slashes.
     * Double dots could be handled as well, e.g.:
     *     '/hello/beautiful/../world' => '/hello/world'
     * But, when we decide to follow links, which are implemented
     * in the model, the links would have to be resolved first,
     * in place, before removing path parts.
     *
     * In the terminal a path is relative, until it begins with
     * '/' but in a way I'd prefer it to be absulute until it begins
     * with '.' or '..'
     * Maybe we can use a switch for this, but thinking about this:
     * if(pathParts[0] !== '')
     *     pathParts.unshift(this.RELATIVE);
     * In the end, this is the wrong place to decide! We know
     * if the first element is this.RELATIVE that the path is explicitly
     * relative, and if it is '' the part is explicitly absolute
     * otherwise we don't know in here.
     */
    static sanitize(...rawPathParts: (string | number)[]) {
        const pathParts = rawPathParts
                .map((part) =>
                    typeof part !== "number"
                        ? // will remove contained separators
                          part.split(this.SEPARATOR)
                        : part.toString(10),
                )
                .flat(), // Array.prototype.flat is golden here.
            cleanParts = [];
        for (const [i, part] of pathParts.entries()) {
            if (part === this.RELATIVE) {
                // Only keep as first part, at the other positions it
                // is meaningless!
                // also void in a strings like:
                //         /./path/to => path/to NOT: ./path/to
                //         .././path/to => ../path/to
                //         path/.././to => to NOT ./to
                if (i === 0 && cleanParts.length === 0)
                    // => ['.']
                    cleanParts.push(part);
                continue;
            }
            if (part === "") {
                // filter the remains of consecutive separators/slashes
                if (i === 0 && cleanParts.length === 0)
                    // explicitly absolute
                    cleanParts.push(this.ROOT);
                continue;
            }
            if (part !== this.PARENT) {
                // regular path part
                cleanParts.push(part);
                continue;
            }

            // else: part === this.PARENT
            if (cleanParts.length === 0) {
                // this path is relative beyond its origin
                // => cleanParts = ['..']
                cleanParts.push(part);
                continue;
            }
            // cleanParts.length > 0
            const last = cleanParts.at(-1);
            if (last == this.RELATIVE) {
                // Only happens when cleanParts.length === 1, see above
                // this.RELATIVE is kept only as first item.
                // cleanParts = ['.']
                // => cleanParts = ['..']
                cleanParts.splice(-1, 1, part);
                continue;
            }
            if (last === this.PARENT) {
                // this path is relative beyond its origin and more
                //  => ['..', '..']
                cleanParts.push(part);
                continue;
            }
            // last is a regular pathPart
            // consumes that one
            //  e.g. cleanParts = ['hello', 'world'];
            //       => cleanParts = ['world']
            cleanParts.pop();
        }
        return cleanParts;
    }
    static stringSanitize(str: string): string {
        return this.fromString(str).toString();
    }
    constructor(...pathParts: (string | number)[]) {
        const ctor = this.constructor as typeof Path;
        const [firstPart, ...parts] = ctor.sanitize(...pathParts),
            // ctor.PARENT is not interesting in here as it
            // won't change serialisation
            explicitAnchoring =
                firstPart === ctor.ROOT || firstPart === ctor.RELATIVE
                    ? firstPart
                    : null;
        if (pathParts.length && explicitAnchoring === null)
            // that's a regular part
            parts.unshift(firstPart!);
        Object.defineProperty(this, "explicitAnchoring", {
            value: explicitAnchoring,
            enumerable: true,
        });
        Object.defineProperty(this, "isExplicitlyRelative", {
            value: explicitAnchoring === ctor.RELATIVE,
            enumerable: true,
        });
        Object.defineProperty(this, "isExplicitlyAbsolute", {
            value: explicitAnchoring === ctor.ROOT,
            enumerable: true,
        });

        Object.defineProperty(this, "parts", {
            value: Object.freeze(parts),
            enumerable: true,
        });
    }
    static fromParts(...pathParts: (string | number)[]): Path {
        return new this(...pathParts);
    }
    static fromString(pathString: string): Path {
        const splitted =
            pathString === "" ? [] : pathString.split(this.SEPARATOR);
        return this.fromParts(...splitted);
    }
    fromString(pathString: string): Path {
        return (this.constructor as typeof Path).fromString(pathString);
    }
    fromParts(...pathParts: (string | number)[]): Path {
        return (this.constructor as typeof Path).fromParts(...pathParts);
    }
    toString(
        defaultAnchoring: string | null = null /*ROOT || RELATIVE || null */,
    ): string {
        const ctor = this.constructor as typeof Path;
        if (
            defaultAnchoring !== null &&
            defaultAnchoring !== ctor.RELATIVE &&
            defaultAnchoring !== ctor.ROOT
        )
            throw new Error(
                `TYPE ERROR defaultAnchoring must be either null, ` +
                    `${ctor.name}.RELATIVE or ` +
                    `${ctor.name}.ROOT but it is: "${defaultAnchoring}".`,
            );
        const anchoring =
            this.explicitAnchoring === null
                ? defaultAnchoring
                : this.explicitAnchoring;
        if (anchoring === null) return this.parts.join(ctor.SEPARATOR);
        if (this.parts.length === null) return anchoring;
        return [
            anchoring === ctor.SEPARATOR ? "" : anchoring,
            ...this.parts,
        ].join(ctor.SEPARATOR);
    }
    *[Symbol.iterator]() {
        if (this.explicitAnchoring !== null) yield this.explicitAnchoring;
        yield* this.parts;
    }
    appendString(pathString: string): Path {
        return this.append(...this.fromString(pathString).parts);
    }
    append(...pathParts: (string | number)[]): Path {
        return this.fromParts(...this, ...pathParts);
    }
    get isBase() {
        return this.parts.length === 0;
    }
    slice(from: number, to?: number): Path {
        return this.fromParts(
            this.explicitAnchoring || "",
            ...this.parts.slice(from, to),
        );
    }
    get parent() {
        if (this.isBase)
            throw new Error("Can't get parent path is a base path.");
        return this.slice(0, -1);
    }
    startsWith(rootPath: Path): boolean {
        const parts = [...this];
        for (const part of rootPath) {
            if (parts.shift() !== part) return false;
        }
        // Each part of rootPath is at the beginning of this;
        return true;
    }
    isRootOf(pathOrString: Path | string): boolean {
        const path =
            typeof pathOrString === "string"
                ? Path.fromString(pathOrString)
                : pathOrString;
        return path.startsWith(this);
    }
    equals(pathOrString: Path | string): boolean {
        if (pathOrString === this) return true;
        const path =
            typeof pathOrString === "string"
                ? Path.fromString(pathOrString)
                : pathOrString;
        return path.startsWith(this) && this.startsWith(path);
    }
    toRelative(rootPath: Path): Path {
        if (!this.startsWith(rootPath))
            throw new Error(
                `VALUE ERROR ${this.constructor.name}.toRelative ` +
                    `this ${this} does not start with rootPath ${rootPath}`,
            );
        const parts = [...this],
            rootPathParts = [...rootPath],
            relativeParts = parts.slice(rootPathParts.length);
        return Path.fromParts(".", ...relativeParts);
    }
}
