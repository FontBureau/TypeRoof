---
title: Extend Glyph-Groups
eleventyNavigation:
  parent: Developer Kit
  key: Glyph-Groups
  title: Extend Glyph-Groups
  order: 1
---

# How To: {{title}}

The Glyphs selection UI-widget has some entries that are curated via a
YAML formated text file [lib/assets/glyph-groups.yaml](https://github.com/FontBureau/TypeRoof/blob/main/lib/assets/glyph-groups.yaml).
The data is however loaded by the application from a JSON formatted file
[lib/assets/glyph-groups.json](https://github.com/FontBureau/TypeRoof/blob/main/lib/assets/glyph-groups.json).
The main reason for YAML as human input is that YAML can contain comments, which
help to describe the expected data and to explain the actual data. The reason
for JSON for reading by the application is that it's a format that can
be read natively in a Browser without an extra dependency.

## The YAML format

The data expected in the YAML formatted is also described as a comment
directly in the file [lib/assets/glyph-groups.yaml](https://github.com/FontBureau/TypeRoof/blob/main/lib/assets/glyph-groups.yaml)

Character groupings can be one or two levels deep (see Latin > Symbols)

Two ways of handling "extended" character sets:

1. For simple one-to-many character extensions (e.g. accented Latin letters), add them to the global "_extended" list at the bottom.
    These will be expanded "in place" automatically whenever that character is encountered in a character set.
2. For custom extensions (e.g. currency symbols) include "_default" and "_extended" strings under each label

Here's an excerpt from the file, .

```yaml
Latin:
    Uppercase: ABCDEFGHIJKLMNOPQRSTUVWXYZ&
    Lowercase: abcdefghijklmnopqrstuvwxyz
    Mixed: ǅǈǋǉ
    ASCII: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789<([{@#$%&?!/|\\\"~`*^':;.,)]}>"
    Latin-1: " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u00A0¡¢£¤¥¦§¨©ª«¬\u00AD®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ"
    Symbols:
        Punctuation: ',-.:;…∙·!¡?¿–—―‐'
        Reference: '*§¶†‡•'
        Quotation: "\"'“”‚„‹›«»′″"
        Parenthetical: '()[]{}'
        Math: '+÷×−±<>≤≥≈≠=^~¬∕­/'
        Commercial: '®©™#@⁒ʹʺ/\¦|_№⟨⟩µ⁄'
Greek:
    Uppercase: ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ
    Lowercase: αβγδεζηθικλμνξοπρστυφχψως
Cyrillic:
    Uppercase: АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ
    Lowercase: абвгдежзийклмнопрстуфхцчшщъыьэюя
# [...]
_extended:
    # YAML evaluates Y/N/y/n as true and false, so we have to put quotes around those
    A: ÀÁÂÃÄÅĀĂǺȀȂĄẠẢẤẦẨẪẬẮẰẲẴẶÆǼ
    C: ÇĆĈĊČ
    D: ĎÐĐǄǅ
    E: ÈÉÊËĒĔĖĘĚȄȆẸẺẼẾỀỂỄỆÆǼŒƏ
    G: ĜĞĠĢǦ
    H: ĤĦ
# [...]
```

### YAML Format Tips

 * Indentation is important! Four spaces.
 * Most strings can be unquoted, unless they contain quotes or some other punctuation. If in doubt, you can quote (single or double)
 * Unquoted single characters Y/N/y/n are synonyms for True and False in YAML, so they should be quoted if used

## Example: Adding "Latin-1"

`Latin-1` is also known as `ISO/IEC 8859-1` and an explanation can be found on [Wikipedia](https://en.wikipedia.org/wiki/ISO/IEC_8859-1),
where we can also find a table with all the contents:

<!-- Directly copied from the Wikipedia markup.
But, had to make the links absolute.
 -->
<table class="wikitable nounderlines nowrap" border="1" style="border-collapse:collapse;text-align:center;background:#FFFFFF;font-size:large">
<caption style="background:#F8F8F8;font-size:80%;line-height:1.5">ISO/IEC 8859-1
</caption>
<tbody><tr style="background:#F8F8F8;font-size:small">
<td>
</td>
<td style="width:20pt">0
</td>
<td style="width:20pt">1
</td>
<td style="width:20pt">2
</td>
<td style="width:20pt">3
</td>
<td style="width:20pt">4
</td>
<td style="width:20pt">5
</td>
<td style="width:20pt">6
</td>
<td style="width:20pt">7
</td>
<td style="width:20pt">8
</td>
<td style="width:20pt">9
</td>
<td style="width:20pt">A
</td>
<td style="width:20pt">B
</td>
<td style="width:20pt">C
</td>
<td style="width:20pt">D
</td>
<td style="width:20pt">E
</td>
<td style="width:20pt">F
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">0x
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">1x
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">2x
</td>
<td title="32
U+0020: SPACE" style="font-size:75%;padding:1px;"><span style="display:inline-block; border:1px dashed blue;"> <a href="https://en.wikipedia.org/wiki/Space_character" class="mw-redirect" title="Space character">&nbsp;SP&nbsp;</a> </span>
</td>
<td title="33
U+0021: EXCLAMATION MARK" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/!" class="mw-redirect" title="!">!</a>
</td>
<td title="34
U+0022: QUOTATION MARK" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%22" class="mw-redirect" title="&quot;">"</a>
</td>
<td title="35
U+0023: NUMBER SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/Number_sign" title="Number sign">#</a>
</td>
<td title="36
U+0024: DOLLAR SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/$" class="mw-redirect" title="$">$</a>
</td>
<td title="37
U+0025: PERCENT SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%25" class="mw-redirect" title="%">%</a>
</td>
<td title="38
U+0026: AMPERSAND" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%26" class="mw-redirect" title="&amp;">&amp;</a>
</td>
<td title="39
U+0027: APOSTROPHE" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%27" class="mw-redirect" title="'">'</a>
</td>
<td title="40
U+0028: LEFT PARENTHESIS" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/(" class="mw-redirect" title="(">(</a>
</td>
<td title="41
U+0029: RIGHT PARENTHESIS" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/)" class="mw-redirect" title=")">)</a>
</td>
<td title="42
U+002A: ASTERISK" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/*" class="mw-redirect" title="*">*</a>
</td>
<td title="43
U+002B: PLUS SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%2B" class="mw-redirect" title="+">+</a>
</td>
<td title="44
U+002C: COMMA" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/," class="mw-redirect" title=",">,</a>
</td>
<td title="45
U+002D: HYPHEN-MINUS" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/-" class="mw-redirect" title="-">-</a>
</td>
<td title="46
U+002E: FULL STOP" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/Full_stop" title="Full stop">.</a>
</td>
<td title="47
U+002F: SOLIDUS" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/Slash_(punctuation)" title="Slash (punctuation)">/</a>
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">3x
</td>
<td title="48
U+0030: DIGIT ZERO" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/0" title="0">0</a>
</td>
<td title="49
U+0031: DIGIT ONE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/1" title="1">1</a>
</td>
<td title="50
U+0032: DIGIT TWO" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/2" title="2">2</a>
</td>
<td title="51
U+0033: DIGIT THREE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/3" title="3">3</a>
</td>
<td title="52
U+0034: DIGIT FOUR" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/4" title="4">4</a>
</td>
<td title="53
U+0035: DIGIT FIVE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/5" title="5">5</a>
</td>
<td title="54
U+0036: DIGIT SIX" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/6" title="6">6</a>
</td>
<td title="55
U+0037: DIGIT SEVEN" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/7" title="7">7</a>
</td>
<td title="56
U+0038: DIGIT EIGHT" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/8" title="8">8</a>
</td>
<td title="57
U+0039: DIGIT NINE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/9" title="9">9</a>
</td>
<td title="58
U+003A: COLON" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/Colon_(punctuation)" title="Colon (punctuation)">:</a>
</td>
<td title="59
U+003B: SEMICOLON" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/;" class="mw-redirect" title=";">;</a>
</td>
<td title="60
U+003C: LESS-THAN SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/Less-than_sign" title="Less-than sign">&lt;</a>
</td>
<td title="61
U+003D: EQUALS SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%3D" class="mw-redirect" title="=">=</a>
</td>
<td title="62
U+003E: GREATER-THAN SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/Greater-than_sign" title="Greater-than sign">&gt;</a>
</td>
<td title="63
U+003F: QUESTION MARK" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%3F" class="mw-redirect" title="?">?</a>
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">4x
</td>
<td title="64
U+0040: COMMERCIAL AT" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/@" class="mw-redirect" title="@">@</a>
</td>
<td title="65
U+0041: LATIN CAPITAL LETTER A" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/A" title="A">A</a>
</td>
<td title="66
U+0042: LATIN CAPITAL LETTER B" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/B" title="B">B</a>
</td>
<td title="67
U+0043: LATIN CAPITAL LETTER C" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/C" title="C">C</a>
</td>
<td title="68
U+0044: LATIN CAPITAL LETTER D" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/D" title="D">D</a>
</td>
<td title="69
U+0045: LATIN CAPITAL LETTER E" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/E" title="E">E</a>
</td>
<td title="70
U+0046: LATIN CAPITAL LETTER F" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/F" title="F">F</a>
</td>
<td title="71
U+0047: LATIN CAPITAL LETTER G" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/G" title="G">G</a>
</td>
<td title="72
U+0048: LATIN CAPITAL LETTER H" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/H" title="H">H</a>
</td>
<td title="73
U+0049: LATIN CAPITAL LETTER I" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/I" title="I">I</a>
</td>
<td title="74
U+004A: LATIN CAPITAL LETTER J" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/J" title="J">J</a>
</td>
<td title="75
U+004B: LATIN CAPITAL LETTER K" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/K" title="K">K</a>
</td>
<td title="76
U+004C: LATIN CAPITAL LETTER L" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/L" title="L">L</a>
</td>
<td title="77
U+004D: LATIN CAPITAL LETTER M" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/M" title="M">M</a>
</td>
<td title="78
U+004E: LATIN CAPITAL LETTER N" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/N" title="N">N</a>
</td>
<td title="79
U+004F: LATIN CAPITAL LETTER O" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/O" title="O">O</a>
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">5x
</td>
<td title="80
U+0050: LATIN CAPITAL LETTER P" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/P" title="P">P</a>
</td>
<td title="81
U+0051: LATIN CAPITAL LETTER Q" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/Q" title="Q">Q</a>
</td>
<td title="82
U+0052: LATIN CAPITAL LETTER R" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/R" title="R">R</a>
</td>
<td title="83
U+0053: LATIN CAPITAL LETTER S" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/S" title="S">S</a>
</td>
<td title="84
U+0054: LATIN CAPITAL LETTER T" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/T" title="T">T</a>
</td>
<td title="85
U+0055: LATIN CAPITAL LETTER U" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/U" title="U">U</a>
</td>
<td title="86
U+0056: LATIN CAPITAL LETTER V" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/V" title="V">V</a>
</td>
<td title="87
U+0057: LATIN CAPITAL LETTER W" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/W" title="W">W</a>
</td>
<td title="88
U+0058: LATIN CAPITAL LETTER X" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/X" title="X">X</a>
</td>
<td title="89
U+0059: LATIN CAPITAL LETTER Y" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/Y" title="Y">Y</a>
</td>
<td title="90
U+005A: LATIN CAPITAL LETTER Z" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/Z" title="Z">Z</a>
</td>
<td title="91
U+005B: LEFT SQUARE BRACKET" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/Left_square_bracket" class="mw-redirect" title="Left square bracket">[</a>
</td>
<td title="92
U+005C: REVERSE SOLIDUS" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/Backslash" title="Backslash">\</a>
</td>
<td title="93
U+005D: RIGHT SQUARE BRACKET" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/Right_square_bracket" class="mw-redirect" title="Right square bracket">]</a>
</td>
<td title="94
U+005E: CIRCUMFLEX ACCENT" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%5E" class="mw-redirect" title="^">^</a>
</td>
<td title="95
U+005F: LOW LINE" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/Underscore" title="Underscore">_</a>
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">6x
</td>
<td title="96
U+0060: GRAVE ACCENT" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%60" class="mw-redirect" title="`">`</a>
</td>
<td title="97
U+0061: LATIN SMALL LETTER A" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/A" title="A">a</a>
</td>
<td title="98
U+0062: LATIN SMALL LETTER B" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/B" title="B">b</a>
</td>
<td title="99
U+0063: LATIN SMALL LETTER C" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/C" title="C">c</a>
</td>
<td title="100
U+0064: LATIN SMALL LETTER D" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/D" title="D">d</a>
</td>
<td title="101
U+0065: LATIN SMALL LETTER E" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/E" title="E">e</a>
</td>
<td title="102
U+0066: LATIN SMALL LETTER F" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/F" title="F">f</a>
</td>
<td title="103
U+0067: LATIN SMALL LETTER G" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/G" title="G">g</a>
</td>
<td title="104
U+0068: LATIN SMALL LETTER H" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/H" title="H">h</a>
</td>
<td title="105
U+0069: LATIN SMALL LETTER I" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/I" title="I">i</a>
</td>
<td title="106
U+006A: LATIN SMALL LETTER J" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/J" title="J">j</a>
</td>
<td title="107
U+006B: LATIN SMALL LETTER K" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/K" title="K">k</a>
</td>
<td title="108
U+006C: LATIN SMALL LETTER L" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/L" title="L">l</a>
</td>
<td title="109
U+006D: LATIN SMALL LETTER M" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/M" title="M">m</a>
</td>
<td title="110
U+006E: LATIN SMALL LETTER N" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/N" title="N">n</a>
</td>
<td title="111
U+006F: LATIN SMALL LETTER O" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/O" title="O">o</a>
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">7x
</td>
<td title="112
U+0070: LATIN SMALL LETTER P" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/P" title="P">p</a>
</td>
<td title="113
U+0071: LATIN SMALL LETTER Q" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/Q" title="Q">q</a>
</td>
<td title="114
U+0072: LATIN SMALL LETTER R" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/R" title="R">r</a>
</td>
<td title="115
U+0073: LATIN SMALL LETTER S" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/S" title="S">s</a>
</td>
<td title="116
U+0074: LATIN SMALL LETTER T" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/T" title="T">t</a>
</td>
<td title="117
U+0075: LATIN SMALL LETTER U" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/U" title="U">u</a>
</td>
<td title="118
U+0076: LATIN SMALL LETTER V" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/V" title="V">v</a>
</td>
<td title="119
U+0077: LATIN SMALL LETTER W" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/W" title="W">w</a>
</td>
<td title="120
U+0078: LATIN SMALL LETTER X" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/X" title="X">x</a>
</td>
<td title="121
U+0079: LATIN SMALL LETTER Y" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/Y" title="Y">y</a>
</td>
<td title="122
U+007A: LATIN SMALL LETTER Z" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/Z" title="Z">z</a>
</td>
<td title="123
U+007B: LEFT CURLY BRACKET" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/Left_curly_bracket" class="mw-redirect" title="Left curly bracket">{</a>
</td>
<td title="124
U+007C: VERTICAL LINE" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/Vertical_bar" title="Vertical bar">|</a>
</td>
<td title="125
U+007D: RIGHT CURLY BRACKET" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/Right_curly_bracket" class="mw-redirect" title="Right curly bracket">}</a>
</td>
<td title="126
U+007E: TILDE" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/~" class="mw-redirect" title="~">~</a>
</td>
<td title="" style="padding:1px;background:#DDD">
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">8x
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">9x
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td>
<td title="" style="padding:1px;background:#DDD">
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">Ax
</td>
<td title="160
U+00A0: NO-BREAK SPACE" style="font-size:75%;padding:1px;"><span style="display:inline-block; border:1px dashed blue;"> <a href="https://en.wikipedia.org/wiki/NBSP" class="mw-redirect" title="NBSP">NBSP</a> </span>
</td>
<td title="161
U+00A1: INVERTED EXCLAMATION MARK" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%A1" class="mw-redirect" title="¡">¡</a>
</td>
<td title="162
U+00A2: CENT SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%A2" class="mw-redirect" title="¢">¢</a>
</td>
<td title="163
U+00A3: POUND SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%A3" class="mw-redirect" title="£">£</a>
</td>
<td title="164
U+00A4: CURRENCY SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%A4" class="mw-redirect" title="¤">¤</a>
</td>
<td title="165
U+00A5: YEN SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%A5" class="mw-redirect" title="¥">¥</a>
</td>
<td title="166
U+00A6: BROKEN BAR" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%A6" class="mw-redirect" title="¦">¦</a>
</td>
<td title="167
U+00A7: SECTION SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%A7" class="mw-redirect" title="§">§</a>
</td>
<td title="168
U+00A8: DIAERESIS" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%A8" class="mw-redirect" title="¨">¨</a>
</td>
<td title="169
U+00A9: COPYRIGHT SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%A9" class="mw-redirect" title="©">©</a>
</td>
<td title="170
U+00AA: FEMININE ORDINAL INDICATOR" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C2%AA" class="mw-redirect" title="ª">ª</a>
</td>
<td title="171
U+00AB: LEFT-POINTING DOUBLE ANGLE QUOTATION MARK" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%AB" class="mw-redirect" title="«">«</a>
</td>
<td title="172
U+00AC: NOT SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%AC" class="mw-redirect" title="¬">¬</a>
</td>
<td title="173
U+00AD: SOFT HYPHEN" style="font-size:75%;padding:1px;"><span style="display:inline-block; border:1px dashed blue;"> <a href="https://en.wikipedia.org/wiki/Soft_hyphen" title="Soft hyphen">SHY</a> </span>
</td>
<td title="174
U+00AE: REGISTERED SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%AE" class="mw-redirect" title="®">®</a>
</td>
<td title="175
U+00AF: MACRON" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%AF" class="mw-redirect" title="¯">¯</a>
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">Bx
</td>
<td title="176
U+00B0: DEGREE SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%B0" class="mw-redirect" title="°">°</a>
</td>
<td title="177
U+00B1: PLUS-MINUS SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%B1" class="mw-redirect" title="±">±</a>
</td>
<td title="178
U+00B2: SUPERSCRIPT TWO" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/Superscript" class="mw-redirect" title="Superscript">²</a>
</td>
<td title="179
U+00B3: SUPERSCRIPT THREE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/Superscript" class="mw-redirect" title="Superscript">³</a>
</td>
<td title="180
U+00B4: ACUTE ACCENT" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%B4" class="mw-redirect" title="´">´</a>
</td>
<td title="181
U+00B5: MICRO SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%CE%9C" class="mw-redirect" title="Μ">µ</a>
</td>
<td title="182
U+00B6: PILCROW SIGN" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%B6" class="mw-redirect" title="¶">¶</a>
</td>
<td title="183
U+00B7: MIDDLE DOT" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%B7" class="mw-redirect" title="·">·</a>
</td>
<td title="184
U+00B8: CEDILLA" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%B8" class="mw-redirect" title="¸">¸</a>
</td>
<td title="185
U+00B9: SUPERSCRIPT ONE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/Superscript" class="mw-redirect" title="Superscript">¹</a>
</td>
<td title="186
U+00BA: MASCULINE ORDINAL INDICATOR" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C2%BA" class="mw-redirect" title="º">º</a>
</td>
<td title="187
U+00BB: RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%BB" class="mw-redirect" title="»">»</a>
</td>
<td title="188
U+00BC: VULGAR FRACTION ONE QUARTER" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/Fraction#Typographical_variations" title="Fraction">¼</a>
</td>
<td title="189
U+00BD: VULGAR FRACTION ONE HALF" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C2%BD" class="mw-redirect" title="½">½</a>
</td>
<td title="190
U+00BE: VULGAR FRACTION THREE QUARTERS" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/Fraction#Typographical_variations" title="Fraction">¾</a>
</td>
<td title="191
U+00BF: INVERTED QUESTION MARK" style="padding:1px;background:#EFF"><a href="https://en.wikipedia.org/wiki/%C2%BF" class="mw-redirect" title="¿">¿</a>
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">Cx
</td>
<td title="192
U+00C0: LATIN CAPITAL LETTER A WITH GRAVE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%80" title="À">À</a>
</td>
<td title="193
U+00C1: LATIN CAPITAL LETTER A WITH ACUTE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%81" title="Á">Á</a>
</td>
<td title="194
U+00C2: LATIN CAPITAL LETTER A WITH CIRCUMFLEX" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%82" title="Â">Â</a>
</td>
<td title="195
U+00C3: LATIN CAPITAL LETTER A WITH TILDE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%83" title="Ã">Ã</a>
</td>
<td title="196
U+00C4: LATIN CAPITAL LETTER A WITH DIAERESIS" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%84" title="Ä">Ä</a>
</td>
<td title="197
U+00C5: LATIN CAPITAL LETTER A WITH RING ABOVE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%85" title="Å">Å</a>
</td>
<td title="198
U+00C6: LATIN CAPITAL LETTER AE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%86" title="Æ">Æ</a>
</td>
<td title="199
U+00C7: LATIN CAPITAL LETTER C WITH CEDILLA" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%87" title="Ç">Ç</a>
</td>
<td title="200
U+00C8: LATIN CAPITAL LETTER E WITH GRAVE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%88" title="È">È</a>
</td>
<td title="201
U+00C9: LATIN CAPITAL LETTER E WITH ACUTE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%89" title="É">É</a>
</td>
<td title="202
U+00CA: LATIN CAPITAL LETTER E WITH CIRCUMFLEX" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%8A" title="Ê">Ê</a>
</td>
<td title="203
U+00CB: LATIN CAPITAL LETTER E WITH DIAERESIS" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%8B" title="Ë">Ë</a>
</td>
<td title="204
U+00CC: LATIN CAPITAL LETTER I WITH GRAVE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%8C" title="Ì">Ì</a>
</td>
<td title="205
U+00CD: LATIN CAPITAL LETTER I WITH ACUTE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%8D" title="Í">Í</a>
</td>
<td title="206
U+00CE: LATIN CAPITAL LETTER I WITH CIRCUMFLEX" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%8E" title="Î">Î</a>
</td>
<td title="207
U+00CF: LATIN CAPITAL LETTER I WITH DIAERESIS" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%8F" title="Ï">Ï</a>
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">Dx
</td>
<td title="208
U+00D0: LATIN CAPITAL LETTER ETH" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%90" class="mw-redirect" title="Ð">Ð</a>
</td>
<td title="209
U+00D1: LATIN CAPITAL LETTER N WITH TILDE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%91" title="Ñ">Ñ</a>
</td>
<td title="210
U+00D2: LATIN CAPITAL LETTER O WITH GRAVE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%92" title="Ò">Ò</a>
</td>
<td title="211
U+00D3: LATIN CAPITAL LETTER O WITH ACUTE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%93" title="Ó">Ó</a>
</td>
<td title="212
U+00D4: LATIN CAPITAL LETTER O WITH CIRCUMFLEX" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%94" class="mw-redirect" title="Ô">Ô</a>
</td>
<td title="213
U+00D5: LATIN CAPITAL LETTER O WITH TILDE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%95" title="Õ">Õ</a>
</td>
<td title="214
U+00D6: LATIN CAPITAL LETTER O WITH DIAERESIS" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%96" title="Ö">Ö</a>
</td>
<td title="215
U+00D7: MULTIPLICATION SIGN" style="padding:1px;background:#EFD"><a href="https://en.wikipedia.org/wiki/%C3%97" class="mw-redirect" title="×">×</a>
</td>
<td title="216
U+00D8: LATIN CAPITAL LETTER O WITH STROKE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%98" title="Ø">Ø</a>
</td>
<td title="217
U+00D9: LATIN CAPITAL LETTER U WITH GRAVE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%99" class="mw-redirect" title="Ù">Ù</a>
</td>
<td title="218
U+00DA: LATIN CAPITAL LETTER U WITH ACUTE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%9A" title="Ú">Ú</a>
</td>
<td title="219
U+00DB: LATIN CAPITAL LETTER U WITH CIRCUMFLEX" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%9B" title="Û">Û</a>
</td>
<td title="220
U+00DC: LATIN CAPITAL LETTER U WITH DIAERESIS" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%9C" title="Ü">Ü</a>
</td>
<td title="221
U+00DD: LATIN CAPITAL LETTER Y WITH ACUTE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%9D" title="Ý">Ý</a>
</td>
<td title="222
U+00DE: LATIN CAPITAL LETTER THORN" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%9E" class="mw-redirect" title="Þ">Þ</a>
</td>
<td title="223
U+00DF: LATIN SMALL LETTER SHARP S" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%9F" title="ß">ß</a>
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">Ex
</td>
<td title="224
U+00E0: LATIN SMALL LETTER A WITH GRAVE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%80" title="À">à</a>
</td>
<td title="225
U+00E1: LATIN SMALL LETTER A WITH ACUTE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%81" title="Á">á</a>
</td>
<td title="226
U+00E2: LATIN SMALL LETTER A WITH CIRCUMFLEX" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%82" title="Â">â</a>
</td>
<td title="227
U+00E3: LATIN SMALL LETTER A WITH TILDE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%83" title="Ã">ã</a>
</td>
<td title="228
U+00E4: LATIN SMALL LETTER A WITH DIAERESIS" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%84" title="Ä">ä</a>
</td>
<td title="229
U+00E5: LATIN SMALL LETTER A WITH RING ABOVE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%85" title="Å">å</a>
</td>
<td title="230
U+00E6: LATIN SMALL LETTER AE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%86" title="Æ">æ</a>
</td>
<td title="231
U+00E7: LATIN SMALL LETTER C WITH CEDILLA" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%87" title="Ç">ç</a>
</td>
<td title="232
U+00E8: LATIN SMALL LETTER E WITH GRAVE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%88" title="È">è</a>
</td>
<td title="233
U+00E9: LATIN SMALL LETTER E WITH ACUTE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%89" title="É">é</a>
</td>
<td title="234
U+00EA: LATIN SMALL LETTER E WITH CIRCUMFLEX" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%8A" title="Ê">ê</a>
</td>
<td title="235
U+00EB: LATIN SMALL LETTER E WITH DIAERESIS" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%8B" title="Ë">ë</a>
</td>
<td title="236
U+00EC: LATIN SMALL LETTER I WITH GRAVE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%8C" title="Ì">ì</a>
</td>
<td title="237
U+00ED: LATIN SMALL LETTER I WITH ACUTE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%8D" title="Í">í</a>
</td>
<td title="238
U+00EE: LATIN SMALL LETTER I WITH CIRCUMFLEX" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%8E" title="Î">î</a>
</td>
<td title="239
U+00EF: LATIN SMALL LETTER I WITH DIAERESIS" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%8F" title="Ï">ï</a>
</td></tr>
<tr>
<td style="background:#F8F8F8;height:2em;font-size:small;height:22pt;line-height:1">Fx
</td>
<td title="240
U+00F0: LATIN SMALL LETTER ETH" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%90" class="mw-redirect" title="Ð">ð</a>
</td>
<td title="241
U+00F1: LATIN SMALL LETTER N WITH TILDE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%91" title="Ñ">ñ</a>
</td>
<td title="242
U+00F2: LATIN SMALL LETTER O WITH GRAVE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%92" title="Ò">ò</a>
</td>
<td title="243
U+00F3: LATIN SMALL LETTER O WITH ACUTE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%93" title="Ó">ó</a>
</td>
<td title="244
U+00F4: LATIN SMALL LETTER O WITH CIRCUMFLEX" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%94" class="mw-redirect" title="Ô">ô</a>
</td>
<td title="245
U+00F5: LATIN SMALL LETTER O WITH TILDE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%95" title="Õ">õ</a>
</td>
<td title="246
U+00F6: LATIN SMALL LETTER O WITH DIAERESIS" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%96" title="Ö">ö</a>
</td>
<td title="247
U+00F7: DIVISION SIGN" style="padding:1px;background:#EFD"><a href="https://en.wikipedia.org/wiki/%C3%B7" class="mw-redirect" title="÷">÷</a>
</td>
<td title="248
U+00F8: LATIN SMALL LETTER O WITH STROKE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%98" title="Ø">ø</a>
</td>
<td title="249
U+00F9: LATIN SMALL LETTER U WITH GRAVE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%99" class="mw-redirect" title="Ù">ù</a>
</td>
<td title="250
U+00FA: LATIN SMALL LETTER U WITH ACUTE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%9A" title="Ú">ú</a>
</td>
<td title="251
U+00FB: LATIN SMALL LETTER U WITH CIRCUMFLEX" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%9B" title="Û">û</a>
</td>
<td title="252
U+00FC: LATIN SMALL LETTER U WITH DIAERESIS" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%9C" title="Ü">ü</a>
</td>
<td title="253
U+00FD: LATIN SMALL LETTER Y WITH ACUTE" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%9D" title="Ý">ý</a>
</td>
<td title="254
U+00FE: LATIN SMALL LETTER THORN" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C3%9E" class="mw-redirect" title="Þ">þ</a>
</td>
<td title="255
U+00FF: LATIN SMALL LETTER Y WITH DIAERESIS" style="padding:1px;"><a href="https://en.wikipedia.org/wiki/%C5%B8" title="Ÿ">ÿ</a>
</td></tr>
<tr>
<td colspan="17" style="max-width:320pt;background:#F8F8F8;font-size:75%;text-align:left"><div class="wrap">
<style data-mw-deduplicate="TemplateStyles:r981673959">.mw-parser-output .legend{page-break-inside:avoid;break-inside:avoid-column}.mw-parser-output .legend-color{display:inline-block;min-width:1.25em;height:1.25em;line-height:1.25;margin:1px 0;text-align:center;border:1px solid black;background-color:transparent;color:black}.mw-parser-output .legend-text{}</style><div class="legend"><span class="legend-color mw-no-invert" style="background-color:#DDD; color:black;">&nbsp;&nbsp;&nbsp;</span>&nbsp;Undefined</div>
<link rel="mw-deduplicated-inline-style" href="mw-data:TemplateStyles:r981673959"><div class="legend"><span class="legend-color mw-no-invert" style="background-color:#EFF; color:black;">&nbsp;&nbsp;&nbsp;</span>&nbsp;Symbols and punctuation</div>
<link rel="mw-deduplicated-inline-style" href="mw-data:TemplateStyles:r981673959"><div class="legend"><span class="legend-color mw-no-invert" style="background-color:#EFD; color:black;">&nbsp;&nbsp;&nbsp;</span>&nbsp;Undefined in the first release of ECMA-94 (1985).<sup id="cite_ref-ECMA_1985_ECMA94_R1_18-1" class="reference"><a href="#cite_note-ECMA_1985_ECMA94_R1-18"><span class="cite-bracket">[</span>14<span class="cite-bracket">]</span></a></sup> In the original draft Œ was at 0xD7 and œ was at 0xF7.</div></div>
</td></tr></tbody></table>

* `SP` is the (Space character)[https://en.wikipedia.org/wiki/Space_character],
  we enter it as the literal space character: ` `.
* `NBSP` is the (Non-breaking space)[https://en.wikipedia.org/wiki/NBSP],
  it is entered by its Unicode escape sequence `\u00A0`.
* `SHY` is the (Soft hyphen)[https://en.wikipedia.org/wiki/Soft_hyphen],
  it is entered by its Unicode escape sequence `\u00AD`.
* To be able to include the double quote `"` it must be escaped as `\"`
* The escape character `\` must be escaped as well `\\`

All together, we arrive at the data string, which is put into quotes:

``" !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u00A0¡¢£¤¥¦§¨©ª«¬\u00AD®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ"``

Within the YAML, the category "Latin" is the right superior category to
"Latin-1" and as a computer encoding it makes sense to put it next to "ASCII":

```yaml
Latin:
    # [...]
    ASCII: # [...]
    Latin-1: # Add data here

```

## Generate the JSON Format

If you don't have the `yq` command on your system we can help with
generating the yaml in your pull request.

```
$ yq glyph-groups.yaml -o json > glyph-groups.json
```
