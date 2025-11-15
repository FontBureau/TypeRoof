#! /usr/bin/env node
/* global process */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const KEYS = Symbol('TAGS')
  , LINE_NUMBER = Symbol('LINE_NUMBER')
  , ARRAY_INDEXES = Symbol('ARRAY_INDEXES')
    // CAUTION: if these are modified, the code that consumes the
    // data must be made aware!
  , ARRAY_TYPES = new Set(['Description', 'Prefix', 'Comments'])
  ;

function captureBlock(currentBlock) {
    const block = new Map();
    let type = 'unknown';
    for(const [key, data] of currentBlock) {
        if(key === 'Type') {
            type = data;
            continue;
        }
        block.set(key, data);
    }

    if(type === 'unkown')
        console.error(`MISSING BLOCK TYPE IN BLOCK (line: ${currentBlock[LINE_NUMBER]}) using "${type}"`, block);

    const tagKey = block.has('Subtag') ? 'Subtag' : 'Tag'
      , tag = block.get(tagKey)
      ;
    return [type, tagKey, tag, block];
}

async function parse(fileName) {
    const fileStream = createReadStream(fileName)
      , rl = createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        })
      ;

    let fileDate = null;
    // Note: we use the crlfDelay option to recognize all instances of CR LF
    // ('\r\n') in input.txt as a single line break.
    let currentBlock = null;
    const data = {}
      , flush = ()=> {
            if(currentBlock !== null) {
                const current = currentBlock;
                currentBlock = null;
                const [type, tagKey, tag, block] = captureBlock(current);
                if(type === null) {
                    console.error(...tagKey);
                    return;
                }

                if(!(type in data)) {
                    data[type] = {
                        keyCounter: {}
                      , tagKey
                      , items: new Map() // keeps order
                    };

                }
                const typeData = data[type];

                if(typeData.items.has(tag)) {
                    // unlikeley, but a sanity check.
                    console.error(`SKIP DUPLICATE TAG ${tag} (line:${current[LINE_NUMBER]}) `
                        + `in type "${type}" new block:`, block, 'exising data:', typeData.items.get(tag));
                    return
                }
                typeData.items.set(tag, block);

                if(typeData.tagKey !== tagKey) {
                    console.error(`TAG_KEY for type ${type} was identified as "${typeData.tagKey}" `
                        + `but for the current block it is "${tagKey}" `
                        + `(line:${current[LINE_NUMBER]}) block:`, block);
                }

                for(const key of current[KEYS]) {
                    const count = (key in typeData.keyCounter)
                        ? typeData.keyCounter[key]
                        : 0
                        ;
                    typeData.keyCounter[key] = count + 1;
                }
            }
        }
      ;
    let lineNumber = -1;
    for await (const line of rl) {
        lineNumber += 1;
        if(fileDate===null) {
            const key = "File-Date:";
            if(!line.startsWith(key))
                throw new Error(`FORMAT ERROR: first line must start with "${key}" but is: "${line}" line:${lineNumber}`);
            fileDate = line.slice(key.length).trim();
            console.log(`fileDate: >${fileDate}<`);
            continue;

        }
        if(line === '%%') {
            flush();
            currentBlock = [];
            currentBlock[KEYS] = new Set();
            currentBlock[LINE_NUMBER] = lineNumber;
            currentBlock[ARRAY_INDEXES] = {};
            continue;
        }

        // lines that start with '  rest of line'
        // are multi line texts and should be appended to the previous line
        // as previous + ' rest of line', i.e. remove the first space, keep the
        // second space. applies for e.g. "Description:" or "Comments:"
        if(line.startsWith('  ')) {
            const key = currentBlock.at(-1)[0]
              , newValue = line.slice(1)
              ;
            if(ARRAY_TYPES.has(key)) {
                const previousArray = currentBlock.at(-1)[1];
                previousArray[previousArray.length-1] += newValue;
            }
            else
                currentBlock.at(-1)[1] += newValue;
            continue;
        }

        const keyEnd = line.indexOf(':')
          , key = line.slice(0, keyEnd)
          , value = line.slice(keyEnd+1).trim()
          ;

        // FIXME: some keys are multiple times, then the data should be
        // stored as an array.
        // Description
        // we keep a list of array types and put all of those values into
        // arrays. So, if we encounter an array that is not known as an
        // array type, we fail here!
        if(!ARRAY_TYPES.has(key) && currentBlock[KEYS].has(key)) {
            // array detected
            console.error(`UNREGISTERED ARRAY TYPE: ${key} data will be lost! Line: ${lineNumber}`);
        }
        currentBlock[KEYS].add(key);

        if(ARRAY_TYPES.has(key)) {
            if(key in currentBlock[ARRAY_INDEXES]) {
                const keyIndex = currentBlock[ARRAY_INDEXES][key];
                currentBlock[keyIndex][1].push(value);
            }
            else {
                currentBlock.push([key, [value]])
                currentBlock[ARRAY_INDEXES][key] = currentBlock.length - 1;
            }
        }
        else
            currentBlock.push([key, value]);
     }
    // capture last block
    flush();
    return [fileDate, data];
}

/**
 * Data is packed similat to CSV, that way we don't repeat keys redundantly.
 * there's a 'keys' entry in each type-data object, these are the keys in
 * order. The items in the 'data' entry array of each type-data object
 * are only the data values, with null entries when the data is not set.
 */
function pack(data) {
    const result = {};
    for(const [type, {keyCounter, tagKey, items}] of Object.entries(data)) {
        // we sort these, so we can remove empty items from each block
        // data array at the end. we can't remove keys in-between the
        // data array, only from the end, so if keys are more rare, it's
        // more likeley that we can remove them.
        const keys = Object.keys(keyCounter)
                    // bigger number first!
                    .filter(key=>key !== 'Type' && key !== tagKey)
                    .sort((kA, kB)=>keyCounter[kB]-keyCounter[kA])

          , typeData = []
          , typeResult = {
                 keys: ['$key', ...keys]
               , data: typeData
            }
          ;

        for(const [tag, block] of items) {
            //console.log(tag, block);
            const row = [tag] // $key
            for(const key of keys)
                row.push(block.has(key) ? block.get(key) : null);

            for(let i=row.length-1;i>0;i--) {
                if(row[i]===null)
                    row.pop();
                else
                    // only delete empty trailing items, i.e. stop at the
                    // first not empty item.
                    break;
            }
            typeData.push(row);
        }
        result[type] = typeResult;
    }
    return result;
}

async function main(dataFileName, targetFileName) {
    console.log(`dataFileName: ${dataFileName}\ntargetFileName: ${targetFileName}`);

    if(!targetFileName)
        throw new Error(`TARGET FILE NAME missing`);
    if(targetFileName.indexOf('{type}') === -1)
        throw new Error(`PLACHOLDER MISSING <type> in targetFileName "${targetFileName}" can't create file for subtypes.`);

    const [fileDate, data] = await parse(dataFileName)
      , packedData = pack(data)
      , now = new Date()
      ;

    for(const [key, typeData] of Object.entries(packedData)) {
        const file = targetFileName.replace('{type}', key);
        console.log(`writing ${file}`);
        writeFileSync(file, JSON.stringify({'File-Date': fileDate, 'created': now, ...typeData}));
    }
    console.log(`DONE!`);
}


await main(process.argv[2], process.argv[3]);
