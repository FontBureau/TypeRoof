import markdownIt from "markdown-it";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import path from 'path'

export default function (eleventyConfig) {
    // Output directory: _site

    eleventyConfig.setIncludesDirectory("docs/_includes");

    // use this as the default layout.
    eleventyConfig.addGlobalData("layout", "typeroof");

    // Don't change
    eleventyConfig.addPassthroughCopy("index.html");
    // NOTE: these are also mentioned in .eleventyignore
    eleventyConfig.addPassthroughCopy("lib");
    eleventyConfig.addPassthroughCopy("shell.html");
    eleventyConfig.addPassthroughCopy("docs/experiments");

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
};
