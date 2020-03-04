# Automate VSCode Extension

This is the ESR Automate Textual Language support plugin for Visual Studio Code. [ESR Labs Automate](https://www.esrlabs.com/work/automate/) - a lightweight yet powerful approach to AUTOSAR software development.

## Getting Started
Syntax highlighting works out-of-the-box. For other features ESR Automate RText service is required. How to configure the RText service see the ESR Automate User Manual, Chapter Editor Back-End Service. Basically you have to create the `.rtext` configuration file with the command for the `*.atm` file extension.

```
*.atm:
automate-rtext-service <args...>
```

## Features

- Automate Textual syntax highlighting.
- Auto-completion of language commands and command attributes.
- Improved navigation, developers can follow references across files and jump backward to source elements.

## Syntax Highlighting
![](./images/macro.png)

## Navigation
Use `Ctrl+click` on link references to navigate between model elements.

![](./images/link.gif)

## Auto-completion
Use `Ctrl+space` to show the completion list.

![](./images/auto-completion.gif)

## Requirements

- RText service is part of the ESR Labs Automate product and it's required for some features. [Get Automate](https://www.esrlabs.com/work/automate/).

## Extension Settings

This extension contributes the following settings:

* `automate.enable`: enable/disable this extension
* `automate.useRTextServer`: enable/disable Automate RText service

## Known Issues

1. Changes to .rtext configuration file are not automatically applied, so VSCode needs to be restarted to apply it.
