import markdownIt from "markdown-it";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";

export default function (eleventyConfig) {
	// Output directory: _site
	
	// Copy `lib/` to `_site/img`
	eleventyConfig.addPassthroughCopy("lib", {
		// debug: true
	});
	eleventyConfig.addPassthroughCopy("shell.html")
	//console.log('Hello World, eleventyConfig:', eleventyConfig);

	let mdOptions = {
		html: true,
		breaks: true,
		linkify: true,
		typographer: true,
	};
	eleventyConfig.setLibrary("md", markdownIt(mdOptions));
	eleventyConfig.addPlugin(syntaxHighlight);
};

