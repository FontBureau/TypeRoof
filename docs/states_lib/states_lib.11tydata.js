import path from 'path';
import fs from 'fs';

export default function (/*configData*/) {
    return {
        eleventyComputed: {
            statesList: (data)=>{
                const dirname = path.dirname(data.page.inputPath);
                const files = fs.readdirSync(dirname)
                    .filter(file=>!file.endsWith('.11tydata.js'))
                    .map(file=>{
                        let name;
                        if(fs.statSync(path.join(dirname, file)).isDirectory()){
                            name = `${file}/`
                        }
                        else if(file.endsWith('.json.txt.njk')) {
                            // CAUTION:
                            // I assume that the njk file defines:
                            //      "permalink": "{{filePathStem}}.json.txt",
                            name = file; // keeping the source name
                            file = file.slice(0, -'.njk'.length)//remove.njk
                        }
                        else
                            name = file;

                        const url = path.join('./', file); // local to the page
                        return [name, url];
                    })
                    .filter(item=>item!==null)
                    ;
                return files;
            }
        }
    };
}

