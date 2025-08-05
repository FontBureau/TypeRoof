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
                        const name = fs.statSync(path.join(dirname, file)).isDirectory()
                            ? `${file}/`
                            : file
                          , url = path.join('./', file) // local to the page
                          ;
                        return [name, url];
                    });
                return files;
            }
        }
    };
}

