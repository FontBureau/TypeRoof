import markdownIt from "markdown-it";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import path from 'path'
import fs from 'fs';
import eleventyNavigationPlugin from "@11ty/eleventy-navigation";
import { EleventyHtmlBasePlugin } from "@11ty/eleventy";
import embedEverything from "eleventy-plugin-embed-everything";
import markdownItGitHubHeadings from "markdown-it-github-headings";

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

    const pathPrefix = '/TypeRoof/';

    eleventyConfig.setIncludesDirectory("docs/_includes");
    eleventyConfig.addPlugin(eleventyNavigationPlugin);
    eleventyConfig.addPlugin(EleventyHtmlBasePlugin);
    eleventyConfig.addPlugin(embedEverything);

    // use this as the default layout.
    eleventyConfig.addGlobalData("layout", "typeroof");

    // Don't change
    eleventyConfig.addPassthroughCopy("index.html");
    // These are also mentioned in .eleventyignore
    eleventyConfig.addPassthroughCopy("lib");
    eleventyConfig.addPassthroughCopy("shell.html");
    eleventyConfig.addPassthroughCopy("legacy.html");
    eleventyConfig.addPassthroughCopy("docs/experiments");
    // These are not ignored .eleventyignore
    eleventyConfig.addPassthroughCopy("docs/states_lib/**/*.json.txt");

    let mdOptions = {
        html: true,
        // breaks: true,
        linkify: true,
        typographer: true,
    };
    const md = markdownIt(mdOptions);
    md.use(markdownItGitHubHeadings, {})
    eleventyConfig.setLibrary("md", md);

    eleventyConfig.addPlugin(syntaxHighlight);
    eleventyConfig.addGlobalData('eleventyComputed.rootPath', ()=>{
        return data=>data.page.url
                .split('/')
                .filter(x=>x)
                .map(()=>'../')
                .join('');
        }
    );

    // This creates directory listings for docs/states_lib
    const libDir = 'docs/states_lib'
   , directoryTemplate = `# Index of : {{page.url}}
{% if page.url != "/${libDir}/" %}
  * [\`../\`]({{ '../' | url}})
{% endif %}
{%- for item in statesList %}
  * [\`{{ item[0] }}\`]({{ item[1] | url}})
{% endfor -%}
`
      , directoryTemplateFileName = 'index.md'
      , directoryTitle = 'States Library'
      ;
    for(const path of walkDirSync(libDir, eleventyConfig.directories.input)) {
        // TODO: should not override existing templates that create index.html
        // but there's no case so far.
        const isDirRoot = path === libDir
          , eleventyNavigation = {
                key: isDirRoot ? directoryTitle : path.slice(libDir.length)
            }
          , documentTitle  = isDirRoot
                ? directoryTitle
                : `${eleventyNavigation.key} - ${directoryTitle}`
          ;
        if(!isDirRoot)
            eleventyNavigation.parent = directoryTitle
        eleventyConfig.addTemplate(`${path}/${directoryTemplateFileName}`
              , directoryTemplate
              , { title: documentTitle, eleventyNavigation }
        );
    }

    return {
        pathPrefix
    }
};
