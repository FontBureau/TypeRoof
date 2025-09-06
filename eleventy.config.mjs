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
    eleventyConfig.addPassthroughCopy("legacy.html");
    eleventyConfig.addPassthroughCopy("docs/experiments");
    // These are not ignored .eleventyignore
    eleventyConfig.addPassthroughCopy("docs/states_lib/**/*.json.txt");

    // Include Vite build output (built shell.html and optimized assets)
    eleventyConfig.addPassthroughCopy({ "dist/shell.html": "shell.html" });
    eleventyConfig.addPassthroughCopy({ "dist/app/": "app/" });
    eleventyConfig.addPassthroughCopy({ "dist/assets": "assets" });

    let mdOptions = {
        html: true,
        // breaks: true,
        linkify: true,
        typographer: true,
    };
    const md = markdownIt(mdOptions);
    md.use(markdownItGitHubHeadings, {
        // NOTE: I support the cause of adding prefixes to heading ids,
        // as described in the docs of markdown-it-github-headings, but
        // the hrefs created here do not contain the prefixes. The suggestion
        // is to handle this by listening to hash changes and intercept
        // these, I'm not interested in that approach, I could live with
        // links to e.g. #section-introduction but I also think the risk
        // is in this case not really high, so I just don't use prefixes.
          prefixHeadingIds: false
        //, prefix: 'section-'
        , linkIcon: '#'
        , className: 'heading_anchor'
    })
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

The **States Library** is a directory of states-data that one can load into [TypeRoof Shell](/shell)
for different purposes like demos, tutorials, examples, and testing.

If you don't know what to do with the files provided here, go to the [TypeRoof User Kit](/docs/usage)
and learn how to load states into [TypeRoof Shell](/shell).

## Directory Listing

{% if page.url != "/${libDir}/" %}
  * [\`../\`]({{ '../' | url}})
{% endif %}
{%- for item in statesList %}
  * [\`{{ item[0] }}\`]({{ item[1] | url}})
        <a href="/app/player#[autoplay]from-url:${pathPrefix}{{page.url}}{{item[1]}}" target="_blank" title="open in player">view</a>
        <a href="/shell#from-url:${pathPrefix}{{page.url}}{{item[1]}}" target="_blank" title="open in shell-editor">edit</a>
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
