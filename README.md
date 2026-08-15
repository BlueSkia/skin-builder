# Skia's Skin Builder

Easily define and create sets of character textures for FF14. Hacky but it works™

## Requirements

* [ImageMagick](https://imagemagick.org/download/)
* [Deno](https://deno.land) for developing

## Downloads

[Windows](https://files.eridanus.page/skin-builder/skin_builder-windows.zip) | [Linux](https://files.eridanus.page/skin-builder/skin_builder-linux-x86_64.zip) | [macOS](https://files.eridanus.page/skin-builder/skin_builder-macos-arm64.zip)

## How to build

In the repository root, run either `build.sh` (Linux, macOS) or `build.bat` (Windows).

## How to use

* Add your layers/assets into the `./assets` dir (relative to the executable)
  * Any texture format that ImageMagick understands will, in theory, work here, but I have only tested with png files
* Define your texture sets in `./scripts` (see below)
* Generate your textures with `./skin_builder <script>` (`.\skin_builder.exe <script>` on Windows)
  * `--debug` for detailed info about what's being parsed, the imagemagick cmdline, etc.
  * `--dry-run` to see what would have been created, but do not actually create anything
* Your textures will be found in the `./out` dir, in png format, ready to import into penumbra or textools

## Script files

The skin builder works off of [toml](https://toml.io/en/) config files, or "scripts" as I call them here.

In the `./scripts` dir, each subdirectory is a texture set. Texture sets consist of a required `_default.toml` script that defines the main basic texture stack, and additional optional toml files ("variants") that build up on top of the default. Texture sets are built all together and all the resulting textures are put in the same place.

## Structure of a script file

The basic structure of a script is like this: (anything after a `#` is a comment)

<details>
<summary>Basic structure</summary>

```toml
[general]
name = "Name of the texture set"
layout = "body"
type = "base"

[files]
# Select only one
base = "detailed.png"
# base = "smooth.png"
# base = "some_other_base.png"
# ...

base_addons = [
  # "fingernails.png",
  # "toenails.png",
  # "tattoo.png",
  # ...
]

base_features = [
  # "scars.png",
  # ...
]

decorations = [
  # "tanlines.png",
  # ...
]

overlays = [
  # "scales.png",
  # ...
]

post_overlays = [
  # "bruises.png",
  # "bloody.png",
]
```
</details>

### Sections

#### General

Basic info about your texture.

* **name**: Defines the name of your texture set. Must be the same for all the scripts in the same directory.
* **layout**: What kind of texture this is: `body`, `face`, `asymface`/`faceasym`.
  * `face` and `asymface`/`faceasym` are currently handled the same, but this might change in the future.
* **type** (optional): What's the purpose of the texture: `norm`/`normal` for normal maps, `mask`/`spec`/`specular` for masks, `diff`/`diffuse` for diffuse (fallback type, but prefer defining it anyway)
* **variant** (optional): Name of your variant, this will be the base name of your texture file (i.e. the filename before the extension). If not defined, it will be taken from the script file (e.g. `_default.toml` -> `_default.png`)

#### Note about filenames

All the filenames defined in the following sections are relative to the assets folder (`./assets`), then the layout defined above, then the type of texture.

For example: with `layout = asymface` and `type = normal` then your assets should exist in `./assets/asymface/normal`.

You can have directory separators when defining filenames. On Windows, remember to escape backslashes (`\` -> `\\`).

#### Files

The `base` subsection defines your bottommost layer. This should be a single filename.

All of the following subsections define groups of layers. These are arbitrary, and their main purpose is to organize and add a bit of granularity into the inheritance (explained below).

These subsections are (plus a general idea of the purpose that I had in mind):

* `base_addons` for things that are part of the basic skin layer
* `base_features` for "temporary" or acquired traits of the skin (tanlines, scars, etc)
* `decorations` for random stuff inbetween
* `overlays` for other integral things like scales that override the skin underneath
* `post_overlays` for stuff that should go above everything else, conceptually not part of the skin itself

Each of these is a list of files, and all of them are required. A list can be empty (in case you don't have a use for it), or it can consist of one or more files.

### File definition (advanced)

Except for the `base` layer, which is a single filename, each file can either be a filename (e.g. "tattoo.png"), or a "layer" object that looks like this:

```toml
{ file = "freckles.png", fileOpts = '-channel A -fx "o/2"', layerOpts = "-compose overlay" }
```

where `file` is a filename, and `fileOpts` and `layerOpts` are ImageMagick parameters: `fileOpts` are generally like filters, and `layerOpts` are options that affect the blending behaviour.

These extra options are admittedly hard to grasp and figure out, but here are a couple of useful ones:

Effect | Incantation | Explanation
--- | --- | ---
50% opacity | `fileOpts = '-channel A -fx "o/2"'` | `-channel A` means work on the Alpha channel, `-fx "o/2"` means divide the value of each pixel by 2. By modifying the `-fx "o/2"` part you can adjust the opacity. For example, `-fx "o/8"` to instead divide by 8, e.g. 12.5% opacity.
Overlay blend mode | `layerOpts = "-compose overlay"` | Explicitely switches the blending mode of the current layer to Overlay. This is useful for normal maps, if your layer is fully opaque but mostly neutral (`#8080ff`). Should be the same overlay blend mode as in PS or gimp
Difference blend mode | `layerOpts = "-compose difference"` | Useful, for example, in normal maps where you want to reduce the effect of skin colour influence. Add a pure black texture where the blue channel dictates how much to lower the colour influence.

This is very advanced usage, but it allows for finer control and tricks like, for example, adding a greyscale texture and setting it up so it only affects a specific channel.

## Variants and inheritance

Additional toml files in each directory under `./scripts` will define variants for that texture set. They will inherit the same `[files]` section as the main `_default.toml` file (but you will still need to define the `[general]` section).

However, if a subsection is defined, it will replace the same subsection from the main default file. For example:

```toml
# _default.toml
# ...

[files]
# ... Layers here

overlays = [
  "eyebags.png",
]

# ... The rest of the layers
```

```toml
# makeup.toml
# ...

[files]
overlays = [
  "eyeliner.png",
  "eyeshadow.png",
]
```

This will result in `_default.png` using `eyebags.png`, but `makeup.png` will instead use `eyeliner.png` and `eyeshadow.png` (but it will still use all other textures defined in the other sections).

An empty list of files in a variant will override the same list from the main script with nothing, effectively disabling it for the variant.

## Other considerations

### Asymfaces

In theory, with the correct `fileOpts` and `layerOpts` arguments, you could take any texture, mirror it, and apply it on top. But it's probably much less confusing to just pre-mirror it and place it in the `asymface` directory.

### Face normal maps

Face normals are handled in a special way, due to how the game uses the channel information. Since the alpha channel controls the influence of the lip colour, it must be preserved in the final texture.

The way this tool handles it is like this:

1. The base texture should contain the final alpha channel
1. A copy of the alpha channel is made, and stored temporarily in memory
1. The base texture is made fully opaque, and all other textures are blended on top like normal
1. Finally, the copy of the alpha channel above is re-applied to the final result

If you would like to verify that everything has been stacked correctly, open the resulting texture in the picture editor of your choice and temporarily disable the alpha channel/transparency.

## License

[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): This work has been marked as dedicated to the public domain.
