
import path from 'path';
import fs from 'fs';

function* walkDirSync(relDirPath, basePath) {
    const fullPath = path.join(basePath, relDirPath)
      , stats = fs.statSync(fullPath)
      ;
    if (!stats.isDirectory())
        return;
    yield relDirPath;
    const files = fs.readdirSync(fullPath);
    for(const file of files) {
        const relFilePath = path.join(relDirPath, file);
        yield *walkDirSync(relFilePath, basePath);
    }
}

export default function (configData) {
    return {
        eleventyComputed: {
            statesList: (data)=>{
                // data.page.inputPath
                const dirname = path.dirname(data.page.inputPath);

                // path

                // data.page.url// e.g.: '/docs/states_lib/demos/',


                const files = fs.readdirSync(dirname);
                 //   for(const file of files)

                // console.log(`eleventyComputed statesList data:`, data, '\nconfigData:', configData);
                // data.page.url
                // directory listing....
                return files;
            }
        }
    };
}

