# Content attribution and licensing

## VS Battles Wiki-derived text and data

The structured character profiles, statistics, ability selections, and related
descriptive data in `content/characters/` are adapted from the corresponding
character profile pages on [VS Battles Wiki](https://vsbattles.fandom.com/).
Each character file records its specific source page, licence, and access date,
and the application exposes that attribution with the rendered profile.

Fandom states that wiki text is generally available under the
[Creative Commons Attribution-ShareAlike 3.0 Unported licence](https://creativecommons.org/licenses/by-sa/3.0/)
unless otherwise noted. In accordance with that licence, the VS Battles
Wiki-derived text and structured adaptations in this repository are offered
under CC BY-SA 3.0. Attribution is provided by linking to the relevant source
page, whose history identifies its contributors.

Nexy modifies the source material by converting it to typed YAML, normalising
names and ranked values, mapping abilities into reusable catalogues, and
processing it through a deterministic matchup ruleset. Nexy's result is not an
official VS Battles Wiki product and is not endorsed by Fandom or the VS Battles
Wiki community.

## Excluded material

The CC BY-SA statement above does **not** apply to:

- character images or other non-text media;
- fictional characters, names, likenesses, logos, or trademarks owned by
  publishers and other rights holders;
- third-party material whose source page specifies different terms; or
- the original Nexy application code and interface unless a separate licence
  explicitly says otherwise.

Fandom's licensing policy says non-text media must not be assumed to use the
wiki text licence. Every image therefore carries a separate rights status and
source record. An `unverified-third-party` status is not permission or a
licence. Nexy's production build withholds every image with that status. Only
records marked as original, licensed, public-domain, or covered by documented
permission are included in the deployed image output. The deployed site
exposes a machine-readable
[image rights manifest](https://syntax555.github.io/Nexy/image-rights.json).

## Corrections and rights requests

Attribution corrections and rights-holder review or removal requests can be
submitted through the repository's
[rights-holder request form](https://github.com/Syntax555/Nexy/issues/new?template=rights-holder-request.yml).
Do not post confidential or sensitive evidence in a public issue.
