import markdownIt from "markdown-it";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import path from 'path'
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

export default function (eleventyConfig) {
    // Output directory: _site

    eleventyConfig.setIncludesDirectory("docs/_includes");

    // use this as the default layout.
    eleventyConfig.addGlobalData("layout", "typeroof");

    // Don't change
    eleventyConfig.addPassthroughCopy("index.html");
    // These are also mentioned in .eleventyignore
    eleventyConfig.addPassthroughCopy("lib");
    eleventyConfig.addPassthroughCopy("shell.html");
    eleventyConfig.addPassthroughCopy("docs/experiments");
    // These are not ignored .eleventyignore
    eleventyConfig.addPassthroughCopy("docs/states_lib/**/*.json.txt");

    let mdOptions = {
        html: true,
        breaks: true,
        linkify: true,
        typographer: true,
    };
    eleventyConfig.setLibrary("md", markdownIt(mdOptions));
    eleventyConfig.addPlugin(syntaxHighlight);
    eleventyConfig.addGlobalData('eleventyComputed.rootPath', ()=>{
        return data=>data.page.url
                .split('/')
                .filter(x=>x)
                .map(()=>'../')
                .join('');
        }
    );

    const directoryTemplate = `# Index of : {{page.url}}

{%- for item in statesList %}
  * {{ item }}
{% endfor -%}
`
      , directoryTemplateFileName = 'index.md'
      ;
    for(const path of walkDirSync('docs/states_lib', eleventyConfig.directories.input)) {
        console.log('adding directory index template at:', path);
        // TODO: should not override existing templates that create index.html
        eleventyConfig.addTemplate(`${path}/${directoryTemplateFileName}`, directoryTemplate, {});
    }
};
