import { parseArgs } from "@std/cli/parse-args";
import * as fs from "@std/fs";
import * as path from "@std/path";
import * as toml from "@std/toml";
import * as term from "@coven/terminal";

type LayerOpts = {
  file: string;
  fileOpts?: string;
  layerOpts?: string;
};

type Layer = string | LayerOpts;

const layerGroups = [
  "base",
  "base_addons",
  "base_features",
  "decorations",
  "overlays",
  "post_overlays",
] as const;

type FileStackInitial = {
  [K in typeof layerGroups[number]]: Layer[];
};
type FileStack = Omit<FileStackInitial, typeof layerGroups[0]> & {
  base: string[];
};
type FileStackFromFile = Omit<FileStack, typeof layerGroups[0]> & {
  base: string;
};

type FileNotFoundEntry = {
  file: string;
  assetPath: string;
  layerGroup: typeof layerGroups[number];
};

type FilesNotFoundByGroup = {
  [K in typeof layerGroups[number]]: FileNotFoundEntry[];
};

type Config = {
  general: {
    name: string;
    variant: string;
    layout?: string;
    type?: string;
  };
  files: FileStack;
};

type ConfigFromFile = Omit<Config, "files"> & { files: FileStackFromFile };

const isWindows = Deno.build.os === "windows";

// Hack because I mainly made this for not-windows.
// Reverse the escaping in the cmdline for powersuell, instead of escaping for sh
function reverseEscapePowershell(str: string) {
  return str
    .replaceAll("\\(", "(")
    .replaceAll("\\)", ")");
}

const DEFAULT_CONF = "_default.toml";

const {
  debug,
  "dry-run": dryRun,
  "out-dir": outDir,
  "asset-dir": assetDir,
  _,
} = parseArgs(Deno.args, {
  string: ["out-dir", "asset-dir"],
  boolean: ["debug", "dry-run"],
  default: {
    "out-dir": path.resolve(Deno.cwd(), "out"),
    "asset-dir": path.resolve(Deno.cwd(), "assets"),
  },
  alias: {
    "debug": "d",
    "out-dir": "o",
    "asset-dir": "a",
  },
});

// Print functions
// deno-lint-ignore no-explicit-any
function printDebug(...what: any[]): void {
  if (debug) {
    console.debug(
      term.mix(term.bold, term.white, term.bgYellow)("[DEBUG]"),
      ...what,
    );
  }
}

// deno-lint-ignore no-explicit-any
function printError(...what: any[]): void {
  console.error(
    term.mix(term.bold, term.white, term.bgRed)("[ERROR]"),
    ...what,
  );
}

// deno-lint-ignore no-explicit-any
function printInfo(...what: any[]): void {
  console.info(
    term.mix(term.bold, term.white, term.bgBlue)("[INFO]"),
    ...what,
  );
}

const boldBlue = term.mix(term.bold, term.blue);
const boldCyan = term.mix(term.bold, term.cyan);
const boldGreen = term.mix(term.bold, term.green);
const boldBrightMagenta = term.mix(term.bold, term.brightMagenta);

printDebug(`Out dir: ${outDir}`);
printDebug(`Asset dir: ${assetDir}`);
printDebug(`Extra params: ${_}`);
const noParams = _.length === 0;

// Main script dir
const scriptDir = path.resolve(Deno.cwd(), "scripts");

// No params -> List scripts found and exit
if (noParams) {
  const dirs = [];

  printDebug(`scriptDir: ${scriptDir}`);

  for await (const entry of Deno.readDir(scriptDir)) {
    if (entry.isDirectory) {
      const defaultScriptPath = path.resolve(
        scriptDir,
        entry.name,
        DEFAULT_CONF,
      );
      const exists = await fs.exists(defaultScriptPath, { isFile: true });
      if (exists) {
        printDebug(`${entry.name}/${DEFAULT_CONF} exists`);
        dirs.push(entry);
      } else {
        printDebug(`${entry.name} has no default script`);
      }
    }
  }

  console.log(boldGreen("Available scripts:"));
  dirs.map((v) => console.log("  -", boldBlue(v.name)));
  Deno.exit();
}

// Params -> Read config if found
const dirArg = `${_[0]}`;
const dirPath = path.resolve(scriptDir, dirArg);
const mainScriptPath = path.resolve(dirPath, DEFAULT_CONF);
printDebug(`dirPath: ${dirPath}`);
printDebug(`mainScriptPath: ${mainScriptPath}`);

const hasMainScript = await fs.exists(mainScriptPath, { isFile: true });

if (!hasMainScript) {
  console.log(`No ${dirArg}/${DEFAULT_CONF} file found`);
  Deno.exit(65);
}

// Find variants
const variants: string[] = [];
for await (const file of Deno.readDir(dirPath)) {
  printDebug(`Testing file ${file.name}...`);
  if (
    file.isFile &&
    file.name.endsWith(".toml") &&
    file.name !== DEFAULT_CONF // Handled later
  ) {
    variants.push(file.name);
    printDebug(`Adding file ${file.name}`);
  }
}

const variantsList = [...variants.toSorted()];
const formattedList = [...variantsList].map((v) => boldBlue(v));
console.log(`Found variant configs: ${formattedList.join(", ")}`);

function readAndParseConfig(filePath: string) {
  const contents = Deno.readTextFileSync(filePath);
  const parsed = toml.parse(contents) as ConfigFromFile;

  if (!parsed.general.variant) {
    parsed.general.variant = path.basename(filePath, ".toml");
  }

  return parsed;
}

// Read and store configs
const configDefault = readAndParseConfig(mainScriptPath);

const variantConfigs = variantsList.map((filename) => {
  const filePath = path.resolve(dirPath, filename);
  const parsed = readAndParseConfig(filePath);

  // merge files
  return {
    ...configDefault,
    ...parsed,
    files: {
      ...configDefault.files,
      ...parsed.files,
    },
  } satisfies ConfigFromFile;
});

const allConfigs = [configDefault, ...variantConfigs];
printDebug(allConfigs);

// Utility functions
function getTextureType(type: string) {
  const isNormal = /^norm(al)?$/.test(type);
  const isMask = /^(mask|multi)$/.test(type);
  const isSpecular = /^spec(ular)?$/.test(type);
  const isDefault = !(isNormal || isMask || isSpecular);

  return {
    isNormal,
    isMask,
    isSpecular,
    isDiffuse: isDefault,
    isGeneric: isDefault,
    isDefault,
    value: type,
  };
}
type TextureType = ReturnType<typeof getTextureType>;

function getTextureLayout(layout: string) {
  const isFace = layout.includes("face");
  const isFaceVanilla = layout === "face";
  const isFaceAsym = layout === "asymface" || layout === "faceasym";
  const isDefault = !isFace;

  return {
    isFace,
    isFaceVanilla,
    isFaceAsym,
    isBody: isDefault,
    isGeneric: isDefault,
    isDefault,
    value: layout,
  };
}
type TextureLayout = ReturnType<typeof getTextureLayout>;

function makeAssetPath(
  layerFile: string,
  type: TextureType,
  layout: TextureLayout,
) {
  return path.resolve(
    assetDir,
    layout.value,
    type.value,
    layerFile,
  );
}

function layerHasOptions(layer: Layer): layer is LayerOpts {
  return (layer as LayerOpts).file !== undefined;
}

function layerToArgs(layer: Layer, type: TextureType, layout: TextureLayout) {
  printDebug("=== layerToArgs", layer, type, layout);
  let extraOpts = "";
  const hasOpts = layerHasOptions(layer);

  if (type.isNormal && layout.isFace && !hasOpts) {
    extraOpts = "-compose overlay";
  }

  let args = "";

  if (layerHasOptions(layer)) {
    printDebug("layer has options");
    args = `\\( "${makeAssetPath(layer.file, type, layout)}" ${
      layer.fileOpts || ""
    } \\) ${layer.layerOpts || ""} ${extraOpts} -composite`;
  } else {
    args = `"${makeAssetPath(layer, type, layout)}" ${extraOpts} -composite`;
  }

  printDebug("args", args);
  return args;
}

// Build magick command
allConfigs.forEach(async (config) => {
  const {
    files,
    general: {
      name,
      variant,
      type: _type = "diffuse",
      layout: _layout = "default",
    },
  } = config;

  const filesNotFound: FileNotFoundEntry[] = [];

  const type = getTextureType(_type);
  const layout = getTextureLayout(_layout);

  const magickArgs: string[] = layerGroups.flatMap((layerGroup, i) => {
    printDebug("flatmap", layerGroup, i);

    const tempFiles: FileStack = {
      ...files,
      base: [files.base],
    };

    return tempFiles[layerGroup].reduce((stack, layer, j): string[] => {
      printDebug("reduce loop", stack, i, j, tempFiles[layerGroup]);
      // Base layer
      if (i === 0 && j === 0) {
        printDebug("reduce loop", "first layer");
        // Make sure it's wrapped in double quotes
        const assetPath = `"${
          makeAssetPath(layer as string, type, layout)
        }" -gravity Center`;

        let ret = "";
        if (type.isNormal && layout.isFace) {
          ret = `\\( ${assetPath} -alpha off \\)`;
        } else {
          ret = assetPath;
        }

        return [ret];
      }

      // Test for the file
      const assetPath = makeAssetPath(
        layerHasOptions(layer) ? layer.file : layer,
        type,
        layout,
      );
      if (!fs.existsSync(assetPath)) {
        printDebug(term.red("File does not exist"), layer);

        filesNotFound.push({
          file: layerHasOptions(layer) ? layer.file : layer,
          layerGroup,
          assetPath,
        });
      }

      // All this to fix a maybe bug
      // If a layer sets compose options, they are kept until overriden
      let newLayer = layer;
      const prevArg = stack.at(-1) as string;

      if (prevArg?.includes("-compose")) {
        printDebug("bug fix?", prevArg);

        if (layerHasOptions(newLayer)) {
          newLayer = {
            ...newLayer,
            layerOpts: newLayer.layerOpts || "-compose over",
          };
        } else {
          newLayer = {
            file: newLayer,
            layerOpts: "-compose over",
          };
        }

        printDebug("bug fix?", newLayer);
      }

      return [
        ...stack,
        layerToArgs(newLayer, type, layout).trim(),
      ];
    }, []);
  });

  printDebug("after loop", magickArgs);

  // If face normal, repeat the last layer to recover alpha
  if (type.isNormal && layout.isFace) {
    magickArgs.push(
      magickArgs[0].replace(
        "-alpha off \\)",
        "-compose copy-alpha \\) -composite",
      ),
    );
  }

  const output = path.resolve(
    outDir,
    name,
    layout.value,
    type.value,
    `${variant}.png`,
  );
  magickArgs.push(`-strip "${output}"`);

  const relativeOutput = path.relative(Deno.cwd(), output);

  printDebug(`${variant} args:`, magickArgs);

  const magickCmdline = `magick ${magickArgs.join(" ")}`;
  printDebug(`${variant} cmdline:`, magickCmdline);

  if (isWindows) {
    printDebug(
      "Windows cmdline:",
      `powershell -Command ${reverseEscapePowershell(magickCmdline)}`,
    );
  }

  if (filesNotFound.length > 0) {
    printError(
      `Can't write variant ${boldBlue(variant)} due to missing files!`,
    );
    printError(`    In ${boldBlue(variant + ".toml")}:`);

    const byLayerGroup: Partial<FilesNotFoundByGroup> = {};

    for (const entry of filesNotFound) {
      const { layerGroup } = entry;

      if (byLayerGroup[layerGroup]) {
        byLayerGroup[layerGroup].push(entry);
      } else {
        byLayerGroup[layerGroup] = [entry];
      }
    }

    printDebug("byLayerGroup", byLayerGroup);

    for (const group of layerGroups) {
      if (byLayerGroup[group]) {
        printError(`    > Layer group ${boldCyan(group)}:`);

        for (const entry of byLayerGroup[group]) {
          const relativePath = path.relative(Deno.cwd(), entry.assetPath);
          printError(
            `      - "${boldBrightMagenta(entry.file)}" (file: ${
              boldGreen(relativePath)
            })`,
          );
        }
      }
    }

    return false;
  }

  if (!dryRun) {
    await fs.ensureDir(path.dirname(output));
    let command: Deno.Command | null;

    if (isWindows) {
      command = new Deno.Command("powershell", {
        args: ["-Command", reverseEscapePowershell(magickCmdline)],
      });
    } else {
      command = new Deno.Command("sh", { args: ["-c", magickCmdline] });
    }

    const { code, stdout, stderr } = await command.output();

    printDebug(new TextDecoder().decode(stdout));
    printDebug(new TextDecoder().decode(stderr));

    if (code === 0) {
      console.log(
        `Wrote variant ${boldBlue(variant)} as ${boldGreen(relativeOutput)}`,
      );
    }
  } else {
    printInfo(
      `Dry-run: would have written variant ${boldBlue(variant)} as ${
        boldGreen(relativeOutput)
      }`,
    );
  }
});
