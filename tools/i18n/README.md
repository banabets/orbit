# Orbit translations (中文 / Español)

English is the source language: the keys are the English text used in `t('…')` in the app.

After adding or changing English text in the app, run from this folder:

    python keys.py && python dict_build.py

`keys.py` scans `web/src` for every `t('…')` text. `dict_build.py` merges the translations in `dict_a.py`, `dict_b.py`, `dict_c.py`, `dict_d.py` and `es_mail.json` into `web/src/lib/i18n.dict.ts`, and lists any text still missing a translation. Add missing ones to `dict_d.py` (format: `"English": ("中文", "Español")`).

On Windows, set `PYTHONIOENCODING=utf8` first if the console shows encoding errors.
