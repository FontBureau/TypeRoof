# Test Font Fixtures

Fonts in this directory are used by automated tests (e.g.
`lib/js/font-info.test.mjs`) and are not loaded by the app itself.

## LiberationMono-Regular.ttf

A truly static (non-variable) font, used to test the font-metadata
facade against fonts without an fvar table.

- Source: Liberation Fonts 2.1.x (Red Hat),
  https://github.com/liberationfonts/liberation-fonts
- License: SIL Open Font License, Version 1.1
  (see the font's name table, IDs 13/14; http://scripts.sil.org/OFL)
